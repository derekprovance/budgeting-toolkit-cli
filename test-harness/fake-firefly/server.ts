/**
 * An in-memory Firefly III (6.6.6 semantics) on node:http, for in-process
 * scenario tests. The real SDK, axios and the CLI's pagination loop all run
 * against it unmodified.
 *
 * It models FIREFLY's behavior, never this repository's: every rule below is
 * backed by an observation in test-harness/VERIFICATION.md (Vn) and a literal
 * in test-harness/scenario/firefly-contract.ts. It must not import from src/.
 *
 * - Amounts are unsigned 12-decimal strings; direction comes from `type`.
 * - `budget_id` is dropped on anything but a withdrawal (V8).
 * - A deposit with no source lands on "Cash account"; a named source creates
 *   or reuses a Revenue account (V12). Withdrawals do the same with Expense
 *   accounts.
 * - A transfer without a valid destination is a 422 (V7).
 * - Inactive accounts and bills stay listed with `active: false` (V11, V15).
 * - Date ranges are inclusive at both ends (V16).
 * - `limit` is honored with no cap and defaults to
 *   `PAGINATION_BEHAVIOR.defaultLimit`; `total_pages` is exact (V14).
 * - Bills with start/end compute pay_dates; a bill paid in the window reports
 *   its next occurrence (V11). Without a range, pay_dates is [].
 * - Group ids and journal ids come from distinct sequences.
 * - A fresh instance is EUR-primary; POST /v1/currencies/{code}/primary with a
 *   JSON body switches and enables (V13).
 *
 * Unknown routes answer 501 with the method and path, so a test that needs an
 * endpoint the fake lacks fails loudly instead of quietly reading nothing.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { addDays, inRange, occurrence, toDay, toWireDate } from './dates.js';
import { formatMoney, parseMoney } from './money.js';
import { PAGINATION_BEHAVIOR } from '../scenario/firefly-contract.js';

// ─── State ──────────────────────────────────────────────────────────────────

type AccountType = 'asset' | 'expense' | 'revenue' | 'cash';

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
    asset: 'Asset account',
    expense: 'Expense account',
    revenue: 'Revenue account',
    cash: 'Cash account',
};

interface Account {
    id: string;
    name: string;
    type: AccountType;
    accountRole: string | null;
    active: boolean;
    currencyCode: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

interface Currency {
    id: string;
    code: string;
    name: string;
    symbol: string;
    decimalPlaces: number;
    enabled: boolean;
}

interface Bill {
    id: string;
    name: string;
    amountMin: bigint;
    amountMax: bigint;
    date: string;
    repeatFreq: string;
    skip: number;
    active: boolean;
    currencyCode: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

interface Budget {
    id: string;
    name: string;
    active: boolean;
    order: number;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

interface BudgetLimit {
    id: string;
    budgetId: string;
    start: string;
    end: string;
    amount: bigint;
    currencyCode: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

interface Tag {
    id: string;
    tag: string;
    date: string | null;
    description: string | null;
    createdAt: string;
    updatedAt: string;
}

type TxType = 'withdrawal' | 'deposit' | 'transfer';

interface Split {
    journalId: string;
    type: TxType;
    date: string;
    amount: bigint;
    description: string;
    sourceId: string;
    destinationId: string;
    budgetId: string | null;
    billId: string | null;
    categoryName: string | null;
    tags: string[];
    notes: string | null;
    order: number;
    currencyCode: string;
}

interface Group {
    id: string;
    groupTitle: string | null;
    splits: Split[];
    createdAt: string;
    updatedAt: string;
}

/** One request the fake served, for tests that assert on round-trips */
export interface RequestRecord {
    method: string;
    /** Path below /api, e.g. `/v1/transactions` */
    path: string;
    query: URLSearchParams;
    status: number;
}

export interface FakeFireflyOptions {
    /** Bearer token the fake accepts; defaults to `fake-firefly-token` */
    token?: string;
    /** Email reported by /v1/about/user */
    userEmail?: string;
}

class HttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly body: unknown
    ) {
        super(typeof body === 'object' ? JSON.stringify(body) : String(body));
    }
}

const notFound = () =>
    new HttpError(404, { message: 'Resource not found', exception: 'NotFoundHttpException' });

function validation(field: string, message: string): HttpError {
    return new HttpError(422, { message, errors: { [field]: [message] } });
}

function nowIso(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

// ─── Server ─────────────────────────────────────────────────────────────────

export class FakeFirefly {
    readonly token: string;
    private readonly userEmail: string;
    private server: http.Server | undefined;
    private port = 0;

    /** Every request served since start (or the last {@link clearRequestLog}) */
    readonly requests: RequestRecord[] = [];

    private seq = {
        account: 0,
        bill: 0,
        budget: 0,
        limit: 0,
        tag: 0,
        group: 0,
        // Distinct sequence, offset so a group id is never mistaken for a
        // journal id (real Firefly uses separate sequences that may coincide)
        journal: 1000,
    };

    private readonly accounts: Account[] = [];
    private readonly bills: Bill[] = [];
    private readonly budgets: Budget[] = [];
    private readonly limits: BudgetLimit[] = [];
    private readonly tags: Tag[] = [];
    private readonly groups: Group[] = [];
    private readonly currencies: Currency[] = [
        { id: '1', code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2, enabled: true },
        { id: '8', code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, enabled: false },
        {
            id: '6',
            code: 'GBP',
            name: 'British Pound',
            symbol: '£',
            decimalPlaces: 2,
            enabled: false,
        },
    ];
    private primaryCurrencyCode = 'EUR';

    constructor(options: FakeFireflyOptions = {}) {
        this.token = options.token ?? 'fake-firefly-token';
        this.userEmail = options.userEmail ?? 'e2e@btk.invalid';
    }

    /** Origin without /api, e.g. `http://127.0.0.1:54321` (what FIREFLY_API_URL holds) */
    get url(): string {
        if (!this.server) {
            throw new Error('FakeFirefly is not started');
        }
        return `http://127.0.0.1:${this.port}`;
    }

    /** SDK BASE: {@link url} + `/api` */
    get apiBase(): string {
        return `${this.url}/api`;
    }

    async start(): Promise<void> {
        if (this.server) return;
        const server = http.createServer((req, res) => {
            void this.handle(req, res);
        });
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => resolve());
        });
        this.port = (server.address() as AddressInfo).port;
        this.server = server;
    }

    async stop(): Promise<void> {
        const server = this.server;
        if (!server) return;
        this.server = undefined;
        server.closeAllConnections?.();
        await new Promise<void>((resolve, reject) =>
            server.close(err => (err ? reject(err) : resolve()))
        );
    }

    clearRequestLog(): void {
        this.requests.length = 0;
    }

    /** GET requests served for `path` (below /api), optionally filtered by query */
    served(path: string, match: Record<string, string> = {}): RequestRecord[] {
        return this.requests.filter(
            r =>
                r.method === 'GET' &&
                r.path === path &&
                Object.entries(match).every(([k, v]) => r.query.get(k) === v)
        );
    }

    // ─── Dispatch ───────────────────────────────────────────────────────────

    private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const method = req.method ?? 'GET';
        const parsed = new URL(req.url ?? '/', 'http://fake.invalid');
        const path = parsed.pathname.replace(/^\/api(?=\/)/, '').replace(/\/+$/, '');
        const record: RequestRecord = { method, path, query: parsed.searchParams, status: 0 };
        this.requests.push(record);

        let status: number;
        let payload: unknown;
        try {
            if (!parsed.pathname.startsWith('/api/')) {
                if (method === 'GET' && parsed.pathname === '/health') {
                    record.status = 200;
                    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('OK');
                    return;
                }
                throw this.unknownRoute(method, parsed.pathname);
            }
            const auth = req.headers.authorization ?? '';
            if (auth !== `Bearer ${this.token}`) {
                throw new HttpError(401, {
                    message: 'Unauthenticated.',
                    exception: 'AuthenticationException',
                });
            }
            const rawBody = await readBody(req);
            const body = this.parseBody(method, req.headers['content-type'], rawBody);
            ({ status, payload } = this.route(method, path, parsed.searchParams, body, rawBody));
        } catch (error) {
            if (error instanceof HttpError) {
                status = error.status;
                payload = error.body;
            } else {
                status = 500;
                payload = {
                    message: error instanceof Error ? error.message : String(error),
                    exception: 'FakeFireflyError',
                };
            }
        }

        record.status = status;
        if (status === 204) {
            res.writeHead(204).end();
            return;
        }
        const text = JSON.stringify(payload);
        res.writeHead(status, {
            'Content-Type': 'application/vnd.api+json',
            'Content-Length': Buffer.byteLength(text),
        }).end(text);
    }

    private parseBody(method: string, contentType: string | undefined, raw: string): unknown {
        if (method === 'GET' || method === 'DELETE' || raw.length === 0) {
            return undefined;
        }
        if (!contentType || !/json/i.test(contentType)) {
            throw new HttpError(415, { message: 'Content-Type header cannot be empty.' });
        }
        try {
            return JSON.parse(raw);
        } catch {
            throw new HttpError(400, { message: 'Malformed JSON body' });
        }
    }

    private unknownRoute(method: string, path: string): HttpError {
        return new HttpError(501, {
            message: `FakeFirefly does not implement ${method} ${path}`,
            method,
            path,
        });
    }

    private route(
        method: string,
        path: string,
        q: URLSearchParams,
        body: unknown,
        rawBody: string
    ): { status: number; payload: unknown } {
        const ok = (payload: unknown) => ({ status: 200, payload });
        const seg = path.split('/').filter(Boolean); // ['v1', ...]
        if (seg[0] !== 'v1') throw this.unknownRoute(method, `/api${path}`);
        const [, resource, id, sub, subId] = seg.map(decodeURIComponent);
        const b = (body ?? {}) as Record<string, unknown>;
        const key = `${method} ${resource}${id !== undefined ? '/:id' : ''}${sub !== undefined ? `/${sub}` : ''}${subId !== undefined ? '/:sub' : ''}`;

        switch (resource) {
            case 'about':
                if (method === 'GET' && id === undefined) return ok({ data: this.about() });
                if (method === 'GET' && id === 'user' && sub === undefined)
                    return ok({ data: this.aboutUser() });
                break;
            case 'currencies':
                if (key === 'GET currencies')
                    return ok(this.page(q, this.currencies, c => this.currencyRes(c)));
                if (method === 'GET' && (id === 'primary' || id === 'default') && sub === undefined)
                    return ok({ data: this.currencyRes(this.currency(this.primaryCurrencyCode)) });
                if (method === 'GET' && id !== undefined && sub === undefined)
                    return ok({ data: this.currencyRes(this.currency(id)) });
                if (
                    method === 'POST' &&
                    id !== undefined &&
                    (sub === 'primary' || sub === 'default')
                ) {
                    if (rawBody.length === 0)
                        throw new HttpError(415, {
                            message: 'Content-Type header cannot be empty.',
                        });
                    const c = this.currency(id);
                    c.enabled = true;
                    this.primaryCurrencyCode = c.code;
                    return ok({ data: this.currencyRes(c) });
                }
                if (method === 'POST' && id !== undefined && sub === 'enable') {
                    const c = this.currency(id);
                    c.enabled = true;
                    return ok({ data: this.currencyRes(c) });
                }
                break;
            case 'accounts':
                if (key === 'GET accounts') return ok(this.listAccounts(q));
                if (key === 'POST accounts')
                    return ok({ data: this.accountRes(this.storeAccount(b)) });
                if (key === 'GET accounts/:id')
                    return ok({ data: this.accountRes(this.account(id)) });
                if (key === 'PUT accounts/:id')
                    return ok({ data: this.accountRes(this.updateAccount(id, b)) });
                if (key === 'GET accounts/:id/transactions')
                    return ok(this.listGroups(q, s => s.sourceId === id || s.destinationId === id));
                break;
            case 'bills':
                if (key === 'GET bills')
                    return ok(this.page(q, this.bills, bill => this.billRes(bill, q)));
                if (key === 'POST bills') return ok({ data: this.billRes(this.storeBill(b), q) });
                if (key === 'GET bills/:id') return ok({ data: this.billRes(this.bill(id), q) });
                if (key === 'PUT bills/:id')
                    return ok({ data: this.billRes(this.updateBill(id, b), q) });
                break;
            case 'budgets':
                if (key === 'GET budgets')
                    return ok(this.page(q, this.budgets, x => this.budgetRes(x)));
                if (key === 'POST budgets')
                    return ok({ data: this.budgetRes(this.storeBudget(b)) });
                if (key === 'GET budgets/:id') return ok({ data: this.budgetRes(this.budget(id)) });
                if (key === 'PUT budgets/:id')
                    return ok({ data: this.budgetRes(this.updateBudget(id, b)) });
                if (key === 'GET budgets/:id/limits') {
                    this.budget(id);
                    return ok(this.listLimits(q, id));
                }
                if (key === 'POST budgets/:id/limits')
                    return ok({ data: this.limitRes(this.storeLimit(id, b)) });
                if (key === 'PUT budgets/:id/limits/:sub')
                    return ok({ data: this.limitRes(this.updateLimit(id, subId, b)) });
                if (key === 'GET budgets/:id/transactions')
                    return ok(this.listGroups(q, s => s.budgetId === id));
                break;
            case 'budget-limits':
                if (key === 'GET budget-limits') return ok(this.listLimits(q));
                break;
            case 'tags':
                if (key === 'GET tags') return ok(this.page(q, this.tags, t => this.tagRes(t)));
                if (key === 'POST tags') return ok({ data: this.tagRes(this.storeTag(b)) });
                if (key === 'GET tags/:id') return ok({ data: this.tagRes(this.tag(id)) });
                if (key === 'GET tags/:id/transactions') {
                    const t = this.tag(id);
                    return ok(this.listGroups(q, s => s.tags.includes(t.tag)));
                }
                break;
            case 'transactions':
                if (key === 'GET transactions') {
                    const type = q.get('type');
                    return ok(this.listGroups(q, s => typeMatches(s.type, type)));
                }
                if (key === 'POST transactions')
                    return ok({ data: this.groupRes(this.storeGroup(b)) });
                if (key === 'GET transactions/:id')
                    return ok({ data: this.groupRes(this.group(id)) });
                if (key === 'PUT transactions/:id')
                    return ok({ data: this.groupRes(this.updateGroup(id, b)) });
                if (key === 'DELETE transactions/:id') {
                    const idx = this.groups.findIndex(g => g.id === id);
                    if (idx < 0) throw notFound();
                    this.groups.splice(idx, 1);
                    return { status: 204, payload: undefined };
                }
                break;
        }
        throw this.unknownRoute(method, `/api${path}`);
    }

    // ─── Pagination ─────────────────────────────────────────────────────────

    /** Laravel-style pagination: limit honored with no cap (V14) */
    private page<T>(q: URLSearchParams, items: readonly T[], toRes: (item: T) => unknown) {
        const limitRaw = Number(q.get('limit'));
        const perPage =
            Number.isInteger(limitRaw) && limitRaw > 0
                ? limitRaw
                : PAGINATION_BEHAVIOR.defaultLimit;
        const pageRaw = Number(q.get('page'));
        const current = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
        const total = items.length;
        const totalPages = Math.max(1, Math.ceil(total / perPage));
        const slice = items.slice((current - 1) * perPage, current * perPage);
        return {
            data: slice.map(toRes),
            meta: {
                pagination: {
                    total,
                    count: slice.length,
                    per_page: perPage,
                    current_page: current,
                    total_pages: totalPages,
                },
            },
            links: { self: '', first: '', last: '' },
        };
    }

    // ─── About / currencies ─────────────────────────────────────────────────

    private about() {
        return {
            version: '6.6.6',
            api_version: '6.6.6',
            php_version: '8.5.7',
            os: 'Linux',
            driver: 'fake',
        };
    }

    private aboutUser() {
        return {
            type: 'users',
            id: '1',
            attributes: {
                created_at: '2026-01-01T00:00:00+00:00',
                updated_at: '2026-01-01T00:00:00+00:00',
                email: this.userEmail,
                blocked: false,
                blocked_code: null,
                role: 'owner',
            },
        };
    }

    private currency(code: string): Currency {
        const c = this.currencies.find(x => x.code === code || x.id === code);
        if (!c) throw notFound();
        return c;
    }

    private currencyRes(c: Currency) {
        const primary = c.code === this.primaryCurrencyCode;
        return {
            type: 'currencies',
            id: c.id,
            attributes: {
                created_at: '2026-01-01T00:00:00+00:00',
                updated_at: '2026-01-01T00:00:00+00:00',
                enabled: c.enabled,
                primary,
                default: primary,
                code: c.code,
                name: c.name,
                symbol: c.symbol,
                decimal_places: c.decimalPlaces,
            },
        };
    }

    // ─── Accounts ───────────────────────────────────────────────────────────

    private listAccounts(q: URLSearchParams) {
        const type = q.get('type');
        // V15: `active` is not a filter; inactive accounts are always listed
        const matches = (a: Account) => {
            if (!type || type === 'all') return true;
            if (type === 'asset' || type === 'expense' || type === 'revenue' || type === 'cash')
                return a.type === type;
            if (type === 'special' || type === 'cash account') return a.type === 'cash';
            return false;
        };
        return this.page(q, this.accounts.filter(matches), a => this.accountRes(a));
    }

    private account(id: string): Account {
        const a = this.accounts.find(x => x.id === id);
        if (!a) throw notFound();
        return a;
    }

    private createAccount(name: string, type: AccountType, role: string | null = null): Account {
        const now = nowIso();
        const account: Account = {
            id: String(++this.seq.account),
            name,
            type,
            accountRole: role,
            active: true,
            currencyCode: this.primaryCurrencyCode,
            notes: null,
            createdAt: now,
            updatedAt: now,
        };
        this.accounts.push(account);
        return account;
    }

    private storeAccount(b: Record<string, unknown>): Account {
        const name = str(b.name);
        const type = str(b.type) as AccountType | undefined;
        if (!name) throw validation('name', 'The name field is required.');
        if (!type || !['asset', 'expense', 'revenue'].includes(type))
            throw validation('type', 'The selected type is invalid.');
        if (this.accounts.some(a => a.type === type && a.name === name))
            throw validation('name', 'This account name is already in use.');
        const role = type === 'asset' ? (str(b.account_role) ?? null) : null;
        if (type === 'asset' && !role)
            throw validation(
                'account_role',
                'The account role field is required when type is asset.'
            );
        // V6: both card fields are required, then read back as null
        if (role === 'ccAsset') {
            if (!str(b.credit_card_type))
                throw validation(
                    'credit_card_type',
                    'The credit card type field is required when account role is ccAsset.'
                );
            if (!str(b.monthly_payment_date))
                throw validation(
                    'monthly_payment_date',
                    'The monthly payment date field is required when account role is ccAsset.'
                );
        }
        const account = this.createAccount(name, type, role);
        const code = str(b.currency_code);
        if (code) {
            const c = this.currency(code);
            c.enabled = true;
            account.currencyCode = c.code;
        }
        if (b.active === false) account.active = false;
        account.notes = str(b.notes) ?? null;
        return account;
    }

    private updateAccount(id: string, b: Record<string, unknown>): Account {
        const a = this.account(id);
        if (b.name !== undefined) a.name = String(b.name);
        if (b.active !== undefined) a.active = toBool(b.active);
        if (b.account_role !== undefined && a.type === 'asset')
            a.accountRole = str(b.account_role) ?? null;
        if (b.notes !== undefined) a.notes = str(b.notes) ?? null;
        if (b.currency_code !== undefined)
            a.currencyCode = this.currency(String(b.currency_code)).code;
        a.updatedAt = nowIso();
        return a;
    }

    private accountRes(a: Account) {
        const c = this.currency(a.currencyCode);
        const p = this.currency(this.primaryCurrencyCode);
        return {
            type: 'accounts',
            id: a.id,
            attributes: {
                created_at: a.createdAt,
                updated_at: a.updatedAt,
                active: a.active,
                order: a.type === 'asset' ? Number(a.id) : null,
                name: a.name,
                type: a.type === 'cash' ? 'cash' : a.type,
                account_role: a.accountRole,
                currency_id: c.id,
                currency_code: c.code,
                currency_symbol: c.symbol,
                currency_decimal_places: c.decimalPlaces,
                primary_currency_id: p.id,
                primary_currency_code: p.code,
                primary_currency_symbol: p.symbol,
                primary_currency_decimal_places: p.decimalPlaces,
                current_balance: formatMoney(this.balance(a.id)),
                current_balance_date: toWireDate('2026-01-01'),
                notes: a.notes,
                monthly_payment_date: null,
                credit_card_type: null,
                account_number: null,
                iban: null,
                bic: null,
                virtual_balance: '0.000000000000',
                opening_balance: null,
                opening_balance_date: null,
                liability_type: null,
                liability_direction: null,
                interest: null,
                interest_period: null,
                include_net_worth: true,
                longitude: null,
                latitude: null,
                zoom_level: null,
            },
        };
    }

    private balance(accountId: string): bigint {
        let sum = 0n;
        for (const s of this.groups.flatMap(g => g.splits)) {
            if (s.destinationId === accountId) sum += s.amount;
            if (s.sourceId === accountId) sum -= s.amount;
        }
        return sum;
    }

    /** Asset side of a split: must name an existing asset account */
    private resolveAsset(field: 'source' | 'destination', id: unknown, name: unknown): Account {
        const idStr = str(id);
        if (idStr) {
            const a = this.accounts.find(x => x.id === idStr && x.type === 'asset');
            if (a) return a;
        }
        const nameStr = str(name);
        if (nameStr) {
            const a = this.accounts.find(x => x.name === nameStr && x.type === 'asset');
            if (a) return a;
        }
        throw validation(
            `transactions.0.${field}_id`,
            `[c] Need to get a valid ${field} account ID and/or valid ${field} account name to continue.`
        );
    }

    /** Counterparty side: an id, or a name that creates/reuses; empty is the cash account */
    private resolveCounterparty(kind: 'expense' | 'revenue', id: unknown, name: unknown): Account {
        const idStr = str(id);
        if (idStr) {
            const a = this.accounts.find(x => x.id === idStr);
            if (a) return a;
        }
        const nameStr = str(name);
        if (!nameStr) {
            // V12: no name (or "") is the cash account
            return (
                this.accounts.find(x => x.type === 'cash') ??
                this.createAccount('Cash account', 'cash')
            );
        }
        return (
            this.accounts.find(x => x.type === kind && x.name === nameStr) ??
            this.createAccount(nameStr, kind)
        );
    }

    // ─── Bills ──────────────────────────────────────────────────────────────

    private bill(id: string): Bill {
        const bill = this.bills.find(x => x.id === id);
        if (!bill) throw notFound();
        return bill;
    }

    private storeBill(b: Record<string, unknown>): Bill {
        const name = str(b.name);
        if (!name) throw validation('name', 'The name field is required.');
        if (this.bills.some(x => x.name === name))
            throw validation('name', 'This subscription name is already in use.');
        if (b.amount_min === undefined)
            throw validation('amount_min', 'The amount min field is required.');
        if (b.amount_max === undefined)
            throw validation('amount_max', 'The amount max field is required.');
        if (!str(b.date)) throw validation('date', 'The date field is required.');
        const repeatFreq = str(b.repeat_freq);
        if (
            !repeatFreq ||
            !['weekly', 'monthly', 'quarterly', 'half-year', 'yearly'].includes(repeatFreq)
        )
            throw validation('repeat_freq', 'The selected repeat freq is invalid.');
        const now = nowIso();
        const bill: Bill = {
            id: String(++this.seq.bill),
            name,
            amountMin: parseMoney(b.amount_min),
            amountMax: parseMoney(b.amount_max),
            date: toDay(b.date),
            repeatFreq,
            skip: Number(b.skip ?? 0) || 0,
            active: b.active === undefined ? true : toBool(b.active),
            currencyCode: str(b.currency_code)
                ? this.currency(String(b.currency_code)).code
                : this.primaryCurrencyCode,
            notes: str(b.notes) ?? null,
            createdAt: now,
            updatedAt: now,
        };
        this.bills.push(bill);
        return bill;
    }

    private updateBill(id: string, b: Record<string, unknown>): Bill {
        const bill = this.bill(id);
        if (b.name !== undefined) bill.name = String(b.name);
        if (b.amount_min !== undefined) bill.amountMin = parseMoney(b.amount_min);
        if (b.amount_max !== undefined) bill.amountMax = parseMoney(b.amount_max);
        if (b.date !== undefined) bill.date = toDay(b.date);
        if (b.repeat_freq !== undefined) bill.repeatFreq = String(b.repeat_freq);
        if (b.skip !== undefined) bill.skip = Number(b.skip) || 0;
        if (b.active !== undefined) bill.active = toBool(b.active);
        if (b.notes !== undefined) bill.notes = str(b.notes) ?? null;
        bill.updatedAt = nowIso();
        return bill;
    }

    /**
     * V11: with a range, pay_dates lists the occurrences in it; once the bill
     * is paid in the window, the occurrences after the last payment instead —
     * and if none remain in the window, the next one after it. Without a
     * range, both lists are empty.
     */
    private billDates(bill: Bill, q: URLSearchParams) {
        const startRaw = q.get('start');
        const endRaw = q.get('end');
        if (!startRaw || !endRaw) {
            return { payDates: [] as string[], paidDates: [] as unknown[], next: null };
        }
        const start = toDay(startRaw);
        const end = toDay(endRaw);

        const paid: { groupId: string; journalId: string; date: string }[] = [];
        for (const g of this.groups) {
            for (const s of g.splits) {
                if (s.billId === bill.id && inRange(s.date, start, end)) {
                    paid.push({ groupId: g.id, journalId: s.journalId, date: s.date });
                }
            }
        }
        paid.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

        const after = paid.length > 0 ? addDays(paid[paid.length - 1].date, 1) : start;
        const payDates: string[] = [];
        let firstAfter: string | null = null;
        for (let n = 0; n < 10_000; n++) {
            const d = occurrence(bill.date, bill.repeatFreq, bill.skip, n);
            if (d < after) continue;
            if (d > end) {
                firstAfter = firstAfter ?? d;
                break;
            }
            firstAfter = firstAfter ?? d;
            payDates.push(d);
        }
        if (payDates.length === 0 && paid.length > 0 && firstAfter) {
            payDates.push(firstAfter);
        }

        return {
            payDates: payDates.map(toWireDate),
            paidDates: paid.map(p => ({
                transaction_group_id: p.groupId,
                transaction_journal_id: p.journalId,
                date: toWireDate(p.date),
                subscription_id: bill.id,
            })),
            next: payDates[0] ? toWireDate(payDates[0]) : null,
        };
    }

    private billRes(bill: Bill, q: URLSearchParams) {
        const c = this.currency(bill.currencyCode);
        const p = this.currency(this.primaryCurrencyCode);
        const dates = this.billDates(bill, q);
        const round = (v: bigint) => formatMoney(v, c.decimalPlaces);
        return {
            type: 'bills',
            id: bill.id,
            attributes: {
                created_at: bill.createdAt,
                updated_at: bill.updatedAt,
                currency_id: c.id,
                currency_code: c.code,
                currency_symbol: c.symbol,
                currency_decimal_places: c.decimalPlaces,
                primary_currency_id: p.id,
                primary_currency_code: p.code,
                primary_currency_symbol: p.symbol,
                primary_currency_decimal_places: p.decimalPlaces,
                name: bill.name,
                amount_min: round(bill.amountMin),
                amount_max: round(bill.amountMax),
                amount_avg: round((bill.amountMin + bill.amountMax) / 2n),
                date: toWireDate(bill.date),
                end_date: null,
                extension_date: null,
                repeat_freq: bill.repeatFreq,
                skip: bill.skip,
                active: bill.active,
                order: Number(bill.id),
                notes: bill.notes,
                next_expected_match: dates.next,
                next_expected_match_diff: null,
                object_group_id: null,
                object_group_order: null,
                object_group_title: null,
                pay_dates: dates.payDates,
                paid_dates: dates.paidDates,
            },
        };
    }

    // ─── Budgets and limits ─────────────────────────────────────────────────

    private budget(id: string): Budget {
        const budget = this.budgets.find(x => x.id === id);
        if (!budget) throw notFound();
        return budget;
    }

    private storeBudget(b: Record<string, unknown>): Budget {
        const name = str(b.name);
        if (!name) throw validation('name', 'The name field is required.');
        if (this.budgets.some(x => x.name === name))
            throw validation('name', 'This budget name is already in use.');
        const now = nowIso();
        const budget: Budget = {
            id: String(++this.seq.budget),
            name,
            active: b.active === undefined ? true : toBool(b.active),
            order: this.budgets.length + 1,
            notes: str(b.notes) ?? null,
            createdAt: now,
            updatedAt: now,
        };
        this.budgets.push(budget);
        return budget;
    }

    private updateBudget(id: string, b: Record<string, unknown>): Budget {
        const budget = this.budget(id);
        if (b.name !== undefined) budget.name = String(b.name);
        if (b.active !== undefined) budget.active = toBool(b.active);
        if (b.notes !== undefined) budget.notes = str(b.notes) ?? null;
        budget.updatedAt = nowIso();
        return budget;
    }

    private budgetRes(budget: Budget) {
        return {
            type: 'budgets',
            id: budget.id,
            attributes: {
                created_at: budget.createdAt,
                updated_at: budget.updatedAt,
                name: budget.name,
                active: budget.active,
                order: budget.order,
                notes: budget.notes,
                auto_budget_type: null,
                auto_budget_period: null,
                auto_budget_amount: null,
                currency_id: null,
                currency_code: null,
                spent: [],
            },
        };
    }

    private storeLimit(budgetId: string, b: Record<string, unknown>): BudgetLimit {
        this.budget(budgetId);
        if (!str(b.start)) throw validation('start', 'The start field is required.');
        if (!str(b.end)) throw validation('end', 'The end field is required.');
        if (b.amount === undefined) throw validation('amount', 'The amount field is required.');
        const now = nowIso();
        const limit: BudgetLimit = {
            id: String(++this.seq.limit),
            budgetId,
            start: toDay(b.start),
            end: toDay(b.end),
            amount: parseMoney(b.amount),
            currencyCode: str(b.currency_code)
                ? this.currency(String(b.currency_code)).code
                : this.primaryCurrencyCode,
            notes: str(b.notes) ?? null,
            createdAt: now,
            updatedAt: now,
        };
        if (limit.end < limit.start)
            throw validation('end', 'The end date must be after the start date.');
        this.limits.push(limit);
        return limit;
    }

    private updateLimit(
        budgetId: string,
        limitId: string,
        b: Record<string, unknown>
    ): BudgetLimit {
        const limit = this.limits.find(l => l.id === limitId && l.budgetId === budgetId);
        if (!limit) throw notFound();
        if (b.start !== undefined) limit.start = toDay(b.start);
        if (b.end !== undefined) limit.end = toDay(b.end);
        if (b.amount !== undefined) limit.amount = parseMoney(b.amount);
        limit.updatedAt = nowIso();
        return limit;
    }

    /** Limits overlapping [start, end] (inclusive); all when no range */
    private listLimits(q: URLSearchParams, budgetId?: string) {
        const start = q.get('start') ? toDay(q.get('start')) : undefined;
        const end = q.get('end') ? toDay(q.get('end')) : undefined;
        const matches = this.limits.filter(
            l =>
                (budgetId === undefined || l.budgetId === budgetId) &&
                (start === undefined || l.end >= start) &&
                (end === undefined || l.start <= end)
        );
        return this.page(q, matches, l => this.limitRes(l));
    }

    private limitRes(l: BudgetLimit) {
        const c = this.currency(l.currencyCode);
        let spent = 0n;
        for (const s of this.groups.flatMap(g => g.splits)) {
            if (
                s.type === 'withdrawal' &&
                s.budgetId === l.budgetId &&
                inRange(s.date, l.start, l.end)
            ) {
                spent += s.amount;
            }
        }
        return {
            type: 'budget_limits',
            id: l.id,
            attributes: {
                created_at: l.createdAt,
                updated_at: l.updatedAt,
                start: `${l.start}T00:00:00+00:00`,
                end: `${l.end}T23:59:59+00:00`,
                budget_id: l.budgetId,
                currency_id: c.id,
                currency_code: c.code,
                currency_name: c.name,
                currency_symbol: c.symbol,
                currency_decimal_places: c.decimalPlaces,
                amount: formatMoney(l.amount, c.decimalPlaces),
                period: 'monthly',
                spent: formatMoney(-spent),
                notes: l.notes,
            },
        };
    }

    // ─── Tags ───────────────────────────────────────────────────────────────

    private tag(idOrName: string): Tag {
        const t = this.tags.find(x => x.tag === idOrName) ?? this.tags.find(x => x.id === idOrName);
        if (!t) throw notFound();
        return t;
    }

    private ensureTag(name: string): Tag {
        const existing = this.tags.find(x => x.tag === name);
        if (existing) return existing;
        const now = nowIso();
        const t: Tag = {
            id: String(++this.seq.tag),
            tag: name,
            date: null,
            description: null,
            createdAt: now,
            updatedAt: now,
        };
        this.tags.push(t);
        return t;
    }

    private storeTag(b: Record<string, unknown>): Tag {
        const name = str(b.tag);
        if (!name) throw validation('tag', 'The tag field is required.');
        if (this.tags.some(x => x.tag === name))
            throw validation('tag', 'This tag is already in use.');
        const t = this.ensureTag(name);
        t.date = str(b.date) ? toDay(b.date) : null;
        t.description = str(b.description) ?? null;
        return t;
    }

    private tagRes(t: Tag) {
        return {
            type: 'tags',
            id: t.id,
            attributes: {
                created_at: t.createdAt,
                updated_at: t.updatedAt,
                tag: t.tag,
                date: t.date,
                description: t.description,
                latitude: null,
                longitude: null,
                zoom_level: null,
            },
        };
    }

    // ─── Transactions ───────────────────────────────────────────────────────

    private group(id: string): Group {
        const g = this.groups.find(x => x.id === id);
        if (!g) throw notFound();
        return g;
    }

    /**
     * Groups with at least one split matching `pred` and dated in
     * [start, end]. Newest first, as Firefly lists them.
     */
    private listGroups(q: URLSearchParams, pred: (s: Split) => boolean) {
        const start = q.get('start') ? toDay(q.get('start')) : undefined;
        const end = q.get('end') ? toDay(q.get('end')) : undefined;
        const matches = this.groups
            .filter(g => g.splits.some(s => pred(s) && inRange(s.date, start, end)))
            .sort((a, b) => {
                const da = a.splits[0].date;
                const db = b.splits[0].date;
                if (da !== db) return da < db ? 1 : -1;
                return Number(b.id) - Number(a.id);
            });
        return this.page(q, matches, g => this.groupRes(g));
    }

    private buildSplit(input: Record<string, unknown>, index: number, groupType?: TxType): Split {
        const type = (str(input.type) ?? groupType) as TxType | undefined;
        if (type !== 'withdrawal' && type !== 'deposit' && type !== 'transfer') {
            throw validation(`transactions.${index}.type`, 'The selected type is invalid.');
        }
        if (!str(input.date))
            throw validation(`transactions.${index}.date`, 'The date field is required.');
        if (input.amount === undefined || input.amount === null || input.amount === '')
            throw validation(`transactions.${index}.amount`, 'The amount field is required.');
        const description = str(input.description);
        if (!description)
            throw validation(
                `transactions.${index}.description`,
                'The description field is required.'
            );

        let amount: bigint;
        try {
            amount = parseMoney(input.amount);
        } catch {
            throw validation(`transactions.${index}.amount`, 'The amount must be a number.');
        }
        if (amount <= 0n)
            throw validation(`transactions.${index}.amount`, 'The amount must be more than zero.');

        let source: Account;
        let destination: Account;
        if (type === 'withdrawal') {
            source = this.resolveAsset('source', input.source_id, input.source_name);
            destination = this.resolveCounterparty(
                'expense',
                input.destination_id,
                input.destination_name
            );
        } else if (type === 'deposit') {
            source = this.resolveCounterparty('revenue', input.source_id, input.source_name);
            destination = this.resolveAsset(
                'destination',
                input.destination_id,
                input.destination_name
            );
        } else {
            source = this.resolveAsset('source', input.source_id, input.source_name);
            destination = this.resolveAsset(
                'destination',
                input.destination_id,
                input.destination_name
            );
        }

        const split: Split = {
            journalId: String(++this.seq.journal),
            type,
            date: toDay(input.date),
            amount,
            description,
            sourceId: source.id,
            destinationId: destination.id,
            budgetId: null,
            billId: null,
            categoryName: str(input.category_name) ?? null,
            tags: [],
            notes: str(input.notes) ?? null,
            order: index,
            currencyCode: (type === 'deposit' ? destination : source).currencyCode,
        };
        this.applyMarkers(split, input);
        return split;
    }

    /** Budget, bill and tags; V8: budget_id is dropped on non-withdrawals */
    private applyMarkers(split: Split, input: Record<string, unknown>): void {
        if ('budget_id' in input || 'budget_name' in input) {
            const budgetId = str(input.budget_id);
            const budgetName = str(input.budget_name);
            let budget: Budget | undefined;
            if (budgetId && budgetId !== '0') budget = this.budgets.find(b => b.id === budgetId);
            else if (budgetName) budget = this.budgets.find(b => b.name === budgetName);
            split.budgetId = split.type === 'withdrawal' && budget ? budget.id : null;
        }
        if (split.type !== 'withdrawal') split.budgetId = null;

        const billKeyPresent = [
            'bill_id',
            'bill_name',
            'subscription_id',
            'subscription_name',
        ].some(k => k in input);
        if (billKeyPresent) {
            const billId = str(input.bill_id) ?? str(input.subscription_id);
            const billName = str(input.bill_name) ?? str(input.subscription_name);
            let bill: Bill | undefined;
            if (billId && billId !== '0') bill = this.bills.find(x => x.id === billId);
            else if (billName) bill = this.bills.find(x => x.name === billName);
            // V19: an inactive bill is accepted
            split.billId = bill ? bill.id : null;
        }

        if (input.tags !== undefined) {
            const tags = Array.isArray(input.tags) ? input.tags.map(String) : [];
            split.tags = [...new Set(tags.filter(t => t.length > 0))];
            split.tags.forEach(t => this.ensureTag(t));
        }
    }

    private storeGroup(b: Record<string, unknown>): Group {
        for (const flag of ['apply_rules', 'fire_webhooks', 'error_if_duplicate_hash']) {
            if (b[flag] !== undefined && typeof b[flag] !== 'boolean')
                throw validation(
                    flag,
                    `The ${flag.replace(/_/g, ' ')} field must be true or false.`
                );
        }
        const inputs = Array.isArray(b.transactions)
            ? (b.transactions as Record<string, unknown>[])
            : [];
        if (inputs.length === 0) throw validation('transactions', 'Need at least one transaction.');
        const splits = inputs.map((input, i) => this.buildSplit(input ?? {}, i, undefined));
        const now = nowIso();
        const group: Group = {
            id: String(++this.seq.group),
            groupTitle: str(b.group_title) ?? null,
            splits,
            createdAt: now,
            updatedAt: now,
        };
        this.groups.push(group);
        return group;
    }

    private updateGroup(id: string, b: Record<string, unknown>): Group {
        const group = this.group(id);
        if (b.group_title !== undefined) group.groupTitle = str(b.group_title) ?? null;
        const inputs = Array.isArray(b.transactions)
            ? (b.transactions as Record<string, unknown>[])
            : [];
        inputs.forEach((input, i) => {
            const journalId = str(input.transaction_journal_id);
            const split = journalId
                ? group.splits.find(s => s.journalId === journalId)
                : group.splits.length === 1
                  ? group.splits[0]
                  : undefined;
            if (!split) {
                throw validation(
                    `transactions.${i}.transaction_journal_id`,
                    'Each split must have transaction_journal_id (either valid ID or 0).'
                );
            }
            if (input.description !== undefined) split.description = String(input.description);
            if (input.date !== undefined) split.date = toDay(input.date);
            if (input.amount !== undefined) split.amount = parseMoney(input.amount);
            if (input.category_name !== undefined)
                split.categoryName = str(input.category_name) ?? null;
            if (input.notes !== undefined) split.notes = str(input.notes) ?? null;
            if (input.type !== undefined) split.type = String(input.type) as TxType;
            const touches = (side: 'source' | 'destination') =>
                input[`${side}_id`] !== undefined || input[`${side}_name`] !== undefined;
            if (touches('source')) {
                split.sourceId =
                    split.type === 'deposit'
                        ? this.resolveCounterparty('revenue', input.source_id, input.source_name).id
                        : this.resolveAsset('source', input.source_id, input.source_name).id;
            }
            if (touches('destination')) {
                split.destinationId =
                    split.type === 'withdrawal'
                        ? this.resolveCounterparty(
                              'expense',
                              input.destination_id,
                              input.destination_name
                          ).id
                        : this.resolveAsset(
                              'destination',
                              input.destination_id,
                              input.destination_name
                          ).id;
            }
            this.applyMarkers(split, input);
        });
        group.updatedAt = nowIso();
        return group;
    }

    private splitRes(s: Split) {
        const src = this.account(s.sourceId);
        const dst = this.account(s.destinationId);
        const c = this.currency(s.currencyCode);
        const p = this.currency(this.primaryCurrencyCode);
        const budget = s.budgetId ? this.budgets.find(b => b.id === s.budgetId) : undefined;
        const bill = s.billId ? this.bills.find(b => b.id === s.billId) : undefined;
        return {
            user: '1',
            transaction_journal_id: s.journalId,
            type: s.type,
            date: toWireDate(s.date),
            order: s.order,
            object_has_currency_setting: true,
            currency_id: c.id,
            currency_code: c.code,
            currency_symbol: c.symbol,
            currency_name: c.name,
            currency_decimal_places: c.decimalPlaces,
            foreign_currency_id: null,
            foreign_currency_code: null,
            foreign_currency_symbol: null,
            foreign_currency_decimal_places: null,
            primary_currency_id: p.id,
            primary_currency_code: p.code,
            primary_currency_symbol: p.symbol,
            primary_currency_decimal_places: p.decimalPlaces,
            amount: formatMoney(s.amount),
            pc_amount: null,
            foreign_amount: null,
            description: s.description,
            source_id: src.id,
            source_name: src.name,
            source_iban: null,
            source_type: ACCOUNT_TYPE_LABEL[src.type],
            destination_id: dst.id,
            destination_name: dst.name,
            destination_iban: null,
            destination_type: ACCOUNT_TYPE_LABEL[dst.type],
            budget_id: budget ? budget.id : null,
            budget_name: budget ? budget.name : null,
            category_id: null,
            category_name: s.categoryName,
            bill_id: bill ? bill.id : null,
            bill_name: bill ? bill.name : null,
            subscription_id: bill ? bill.id : null,
            subscription_name: bill ? bill.name : null,
            reconciled: false,
            notes: s.notes,
            tags: [...s.tags],
            internal_reference: null,
            external_id: null,
            original_source: 'fake-firefly',
            recurrence_id: null,
            recurrence_total: null,
            recurrence_count: null,
            import_hash_v2: `fake-${s.journalId}`,
            sepa_cc: null,
            sepa_ct_op: null,
            sepa_ct_id: null,
            sepa_db: null,
            sepa_country: null,
            sepa_ep: null,
            sepa_ci: null,
            sepa_batch_id: null,
            interest_date: null,
            book_date: null,
            process_date: null,
            due_date: null,
            payment_date: null,
            invoice_date: null,
            latitude: null,
            longitude: null,
            zoom_level: null,
            has_attachments: false,
        };
    }

    private groupRes(g: Group) {
        return {
            type: 'transactions',
            id: g.id,
            attributes: {
                created_at: g.createdAt,
                updated_at: g.updatedAt,
                user: '1',
                group_title: g.groupTitle,
                transactions: g.splits.map(s => this.splitRes(s)),
            },
            links: { self: `/api/v1/transactions/${g.id}` },
        };
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

/** Non-empty string, or undefined */
function str(value: unknown): string | undefined {
    if (value === undefined || value === null) return undefined;
    const s = String(value).trim();
    return s.length > 0 ? s : undefined;
}

function toBool(value: unknown): boolean {
    return value === true || value === 'true' || value === 1 || value === '1';
}

/** Firefly's `type` filter on /v1/transactions */
function typeMatches(type: TxType, filter: string | null): boolean {
    if (!filter || filter === 'all' || filter === 'default') return true;
    const groups: Record<string, TxType[]> = {
        withdrawal: ['withdrawal'],
        withdrawals: ['withdrawal'],
        expense: ['withdrawal'],
        deposit: ['deposit'],
        deposits: ['deposit'],
        income: ['deposit'],
        transfer: ['transfer'],
        transfers: ['transfer'],
    };
    return (groups[filter] ?? []).includes(type);
}
