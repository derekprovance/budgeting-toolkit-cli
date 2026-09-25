/**
 * Seeds the scenario ledger into a Firefly III instance (real or fake) and
 * returns the key → id map.
 *
 * Only the SDK client is used — never raw fetch — so the in-process fake
 * server has to serve exactly the calls made here, and nothing else.
 *
 * Order (plan "Seeder"):
 *   1. USD becomes the primary currency (V13: body {} or it is a 415)
 *   2. tags, asset accounts (ccAsset card fields per V6), budgets + limits, bills
 *   3. every transaction, apply_rules:false / fire_webhooks:false
 *   4. post-seed deactivations
 *   5. read everything back and assert it persisted as declared
 *
 * Pre-flight (is this database empty / already seeded?) and the marker tag are
 * separate exports, because the marker must be created only after the caller
 * has written its own artifacts.
 */
import type { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs.js';
import { markerTag } from '../scenario/hash.js';
import { LEDGER, MARKER_TAG_PREFIX, monthParts } from '../scenario/ledger.js';
import type {
    AccountKey,
    BillKey,
    BudgetKey,
    Endpoint,
    IdMap,
    MonthId,
    TransactionDef,
    TxKey,
} from '../scenario/types.js';

export interface SeedOptions {
    log?: (msg: string) => void;
}

/** Firefly wants amounts as strings; the ledger has at most 2 decimals */
const amountString = (n: number): string => n.toFixed(2);

/** Last calendar day of a YYYY-MM month, UTC */
function monthEnd(month: MonthId): string {
    const { month: m, year } = monthParts(month);
    const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    return `${month}-${String(last).padStart(2, '0')}`;
}

/** Every seeded month, for the pay_dates read-back */
const SEEDED_MONTHS: MonthId[] = ['2024-12', '2025-01', '2025-02', '2025-03'];

class SeedAssertionError extends Error {
    constructor(problems: string[]) {
        super(
            `Seed read-back found ${problems.length} problem(s):\n` +
                problems.map(p => `  - ${p}`).join('\n')
        );
        this.name = 'SeedAssertionError';
    }
}

interface Paged<T> {
    data: T[];
    meta?: { pagination?: { total_pages?: number } };
}

async function allPages<T>(fetchPage: (page: number) => Promise<Paged<T>>): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= 100; page++) {
        const body = await fetchPage(page);
        out.push(...(body.data ?? []));
        if (page >= (body.meta?.pagination?.total_pages ?? 1)) break;
    }
    return out;
}

function endpointFields(
    side: 'source' | 'destination',
    endpoint: Endpoint,
    accounts: Record<AccountKey, string>
): Record<string, string> {
    if ('asset' in endpoint) {
        return { [`${side}_id`]: accounts[endpoint.asset] };
    }
    return { [`${side}_name`]: endpoint.name };
}

/** Static sanity checks on the ledger itself, before touching the server */
function assertLedgerIsSeedable(): void {
    const problems: string[] = [];
    for (const t of LEDGER.transactions) {
        // V8: Firefly silently drops a budget on anything but a withdrawal
        if (t.budget && t.type !== 'withdrawal') {
            problems.push(`${t.key}: budget on a ${t.type} would be dropped (V8)`);
        }
    }
    const keys = LEDGER.transactions.map(t => t.key);
    if (new Set(keys).size !== keys.length) {
        problems.push('duplicate transaction keys');
    }
    if (problems.length > 0) throw new SeedAssertionError(problems);
}

export async function seedScenario(
    client: FireflyClientWithCerts,
    opts: SeedOptions = {}
): Promise<IdMap> {
    const log = opts.log ?? (() => undefined);
    assertLedgerIsSeedable();

    // 1. Primary currency. The SDK's primaryCurrency() sends no body, which
    //    6.6.6 rejects with 415 (V13); go through the SDK's request layer with
    //    an explicit {} body instead.
    log('setting USD as the primary currency');
    await client.request.request<void>({
        method: 'POST',
        url: '/v1/currencies/{code}/primary',
        path: { code: 'USD' },
        body: {},
        mediaType: 'application/json',
    });

    // 2a. Tags
    log(`creating ${LEDGER.tags.length} tags`);
    for (const tag of LEDGER.tags) {
        await client.tags.storeTag({ tag });
    }

    // 2b. Asset accounts
    const accounts = {} as Record<AccountKey, string>;
    for (const a of LEDGER.accounts) {
        const res = await client.accounts.storeAccount({
            name: a.name,
            type: a.type,
            account_role: a.accountRole,
            currency_code: a.currencyCode,
            active: true,
            include_net_worth: true,
            ...(a.accountRole === 'ccAsset'
                ? {
                      credit_card_type: a.creditCardType,
                      monthly_payment_date: a.monthlyPaymentDate,
                  }
                : {}),
        });
        accounts[a.key] = String(res.data.id);
    }
    log(`created ${LEDGER.accounts.length} asset accounts`);

    // 2c. Budgets and their per-month limits
    const budgets = {} as Record<BudgetKey, string>;
    for (const b of LEDGER.budgets) {
        const res = await client.budgets.storeBudget({ name: b.name, active: true });
        const id = String(res.data.id);
        budgets[b.key] = id;
        for (const limit of b.limits) {
            await client.budgets.storeBudgetLimit(id, {
                budget_id: id,
                start: `${limit.month}-01`,
                end: monthEnd(limit.month),
                amount: amountString(limit.amount),
                currency_code: 'USD',
                fire_webhooks: false,
            });
        }
    }
    log(`created ${LEDGER.budgets.length} budgets`);

    // 2d. Bills (all active at first; V19 lets a transaction reference an
    //     inactive bill, but deactivating afterwards mirrors real history)
    const bills = {} as Record<BillKey, string>;
    for (const b of LEDGER.bills) {
        const res = await client.bills.storeBill({
            name: b.name,
            amount_min: amountString(b.amountMin),
            amount_max: amountString(b.amountMax),
            date: b.date,
            repeat_freq: b.repeatFreq,
            currency_code: b.currencyCode,
            active: true,
        });
        bills[b.key] = String(res.data.id);
    }
    log(`created ${LEDGER.bills.length} bills`);

    // 3. Transactions
    const transactions = {} as Record<TxKey, { groupId: string; journalId: string }>;
    for (const t of LEDGER.transactions) {
        const res = await client.transactions.storeTransaction({
            apply_rules: false,
            fire_webhooks: false,
            error_if_duplicate_hash: false,
            transactions: [
                {
                    type: t.type,
                    date: t.date,
                    amount: amountString(t.amount),
                    description: t.description,
                    currency_code: 'USD',
                    ...endpointFields('source', t.source, accounts),
                    ...endpointFields('destination', t.destination, accounts),
                    ...(t.budget ? { budget_id: budgets[t.budget] } : {}),
                    ...(t.bill ? { bill_id: bills[t.bill] } : {}),
                    tags: t.tags.length > 0 ? [...t.tags] : null,
                    notes: t.note,
                },
            ],
        });
        const split = res.data.attributes.transactions[0];
        transactions[t.key] = {
            groupId: String(res.data.id),
            journalId: String(split.transaction_journal_id),
        };
    }
    log(`created ${LEDGER.transactions.length} transactions`);

    // 4. Post-seed deactivations
    for (const a of LEDGER.accounts.filter(x => x.deactivateAfterSeed)) {
        await client.accounts.updateAccount(accounts[a.key], { name: a.name, active: false });
        log(`deactivated account ${a.key}`);
    }
    for (const b of LEDGER.bills.filter(x => x.deactivateAfterSeed)) {
        await client.bills.updateBill(bills[b.key], { name: b.name, active: false });
        log(`deactivated bill ${b.key}`);
    }

    const idMap: IdMap = { accounts, bills, budgets, transactions };

    // 5. Read-back
    await assertSeeded(client, idMap);
    log('read-back verified');

    return idMap;
}

/** Reads every seeded object back and throws if anything did not persist */
export async function assertSeeded(client: FireflyClientWithCerts, idMap: IdMap): Promise<void> {
    const problems: string[] = [];
    const check = (label: string, actual: unknown, expected: unknown) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            problems.push(
                `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
            );
        }
    };

    // Primary currency (V13)
    const primary = await client.currencies.getPrimaryCurrency();
    check('primary currency', primary.data.attributes.code, 'USD');

    // Accounts (V6: card fields read back null)
    for (const a of LEDGER.accounts) {
        const res = await client.accounts.getAccount(idMap.accounts[a.key]);
        const attrs = res.data.attributes;
        check(`account ${a.key} name`, attrs.name, a.name);
        check(`account ${a.key} type`, attrs.type, 'asset');
        check(`account ${a.key} role`, attrs.account_role, a.accountRole);
        check(`account ${a.key} active`, attrs.active, !a.deactivateAfterSeed);
        check(`account ${a.key} currency`, attrs.currency_code, a.currencyCode);
        if (a.accountRole === 'ccAsset') {
            check(`account ${a.key} credit_card_type (V6)`, attrs.credit_card_type ?? null, null);
            check(
                `account ${a.key} monthly_payment_date (V6)`,
                attrs.monthly_payment_date ?? null,
                null
            );
        }
    }

    // Budgets and limits
    for (const b of LEDGER.budgets) {
        const id = idMap.budgets[b.key];
        const res = await client.budgets.getBudget(id);
        check(`budget ${b.key} name`, res.data.attributes.name, b.name);
        const limits = await client.budgets.listBudgetLimitByBudget(
            id,
            undefined,
            '2024-01-01',
            '2026-12-31'
        );
        const actual = (limits.data ?? [])
            .map(l => `${String(l.attributes.start).slice(0, 7)}=${Number(l.attributes.amount)}`)
            .sort();
        const expected = b.limits.map(l => `${l.month}=${l.amount}`).sort();
        check(`budget ${b.key} limits`, actual, expected);
    }

    // Bills
    for (const b of LEDGER.bills) {
        const res = await client.bills.getBill(idMap.bills[b.key]);
        const attrs = res.data.attributes;
        check(`bill ${b.key} name`, attrs.name, b.name);
        check(`bill ${b.key} active`, attrs.active, !b.deactivateAfterSeed);
        check(
            `bill ${b.key} amount_avg`,
            Number(attrs.amount_avg),
            (b.amountMin + b.amountMax) / 2
        );
    }

    // V11: in a ranged query every monthly bill (inactive included) has pay_dates
    for (const month of SEEDED_MONTHS) {
        const listed = await allPages(page =>
            client.bills.listBill(undefined, 500, page, `${month}-01`, monthEnd(month))
        );
        const byId = new Map(listed.map(b => [String(b.id), b]));
        for (const b of LEDGER.bills) {
            const read = byId.get(idMap.bills[b.key]);
            if (!read) {
                problems.push(`bill ${b.key} missing from /v1/bills for ${month}`);
                continue;
            }
            if ((read.attributes.pay_dates ?? []).length === 0) {
                problems.push(`bill ${b.key} has no pay_dates for ${month} (V11)`);
            }
        }
    }

    // Transactions
    const assetNames = new Map(LEDGER.accounts.map(a => [idMap.accounts[a.key], a.name]));
    for (const t of LEDGER.transactions) {
        const ids = idMap.transactions[t.key];
        const res = await client.transactions.getTransaction(ids.groupId);
        const splits = res.data.attributes.transactions;
        if (splits.length !== 1) {
            problems.push(`${t.key}: expected 1 split, got ${splits.length}`);
            continue;
        }
        const s = splits[0];
        check(`${t.key} journal id`, String(s.transaction_journal_id), ids.journalId);
        check(`${t.key} type`, s.type, t.type);
        check(`${t.key} amount`, Number(s.amount), t.amount);
        check(`${t.key} date`, String(s.date).slice(0, 10), t.date);
        check(`${t.key} description`, s.description, t.description);
        check(`${t.key} currency`, s.currency_code, 'USD');
        // V8: no budget on non-withdrawals; the ledger never declares one there
        check(
            `${t.key} budget_id`,
            s.budget_id ? String(s.budget_id) : null,
            t.budget ? idMap.budgets[t.budget] : null
        );
        check(
            `${t.key} bill_id`,
            s.bill_id ? String(s.bill_id) : null,
            t.bill ? idMap.bills[t.bill] : null
        );
        check(`${t.key} tags`, [...(s.tags ?? [])].sort(), [...t.tags].sort());
        checkEndpoint(
            t,
            'source',
            s.source_id,
            s.source_name,
            s.source_type,
            idMap,
            assetNames,
            check
        );
        checkEndpoint(
            t,
            'destination',
            s.destination_id,
            s.destination_name,
            s.destination_type,
            idMap,
            assetNames,
            check
        );
    }

    if (problems.length > 0) throw new SeedAssertionError(problems);
}

function checkEndpoint(
    t: TransactionDef,
    side: 'source' | 'destination',
    id: string | null | undefined,
    name: string | null | undefined,
    type: string | null | undefined,
    idMap: IdMap,
    assetNames: Map<string, string>,
    check: (label: string, actual: unknown, expected: unknown) => void
): void {
    const endpoint = t[side];
    if ('asset' in endpoint) {
        const expectedId = idMap.accounts[endpoint.asset];
        check(`${t.key} ${side}_id`, String(id), expectedId);
        check(`${t.key} ${side}_name`, name, assetNames.get(expectedId));
        return;
    }
    check(`${t.key} ${side}_name`, name, endpoint.name);
    // V12: implicit accounts are revenue (deposit source) or expense
    // (withdrawal destination) accounts — never "Cash account"
    check(`${t.key} ${side}_type`, type, side === 'source' ? 'Revenue account' : 'Expense account');
}

// ─── Pre-flight and marker ──────────────────────────────────────────────────

export type SeedState =
    { kind: 'empty' } | { kind: 'seeded'; marker: string } | { kind: 'foreign'; reason: string };

/**
 * Decides whether a database may be seeded:
 * - `empty`   no tags, asset accounts or transactions: seed it
 * - `seeded`  the current scenario's marker tag exists: reuse it
 * - `foreign` data without our marker, or a marker for another scenario hash
 */
export async function inspectSeedState(client: FireflyClientWithCerts): Promise<SeedState> {
    const expected = markerTag();
    const tags = await allPages(page => client.tags.listTag(undefined, 500, page));
    const names = tags.map(t => String(t.attributes.tag));
    const markers = names.filter(n => n.startsWith(MARKER_TAG_PREFIX));

    if (markers.includes(expected)) {
        return { kind: 'seeded', marker: expected };
    }
    if (markers.length > 0) {
        return {
            kind: 'foreign',
            reason: `database was seeded from a different scenario (${markers.join(', ')}; current ${expected})`,
        };
    }

    const accounts = await client.accounts.listAccount(
        undefined,
        1,
        1,
        undefined,
        undefined,
        undefined,
        'asset'
    );
    const txs = await client.transactions.listTransaction(undefined, 1, 1);
    const counts = {
        tags: names.length,
        assetAccounts: accounts.data.length,
        transactions: txs.data.length,
    };
    if (counts.tags + counts.assetAccounts + counts.transactions > 0) {
        return {
            kind: 'foreign',
            reason: `database has data but no seed marker (${JSON.stringify(counts)}); a partial or foreign seed`,
        };
    }
    return { kind: 'empty' };
}

/** Creates the marker tag. Call LAST, after every artifact is written. */
export async function createMarkerTag(client: FireflyClientWithCerts): Promise<string> {
    const tag = markerTag();
    await client.tags.storeTag({ tag, description: 'btk e2e seed marker (scenario hash)' });
    return tag;
}
