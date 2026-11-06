/**
 * Transcription check for the scenario: recomputes every expected total from
 * ledger.ts with plain arithmetic written inline here — NOT with src/ logic —
 * and asserts it equals the hand-written literals in expected.ts and
 * firefly-contract.ts. A mismatch means one of the two was mistyped.
 *
 * The model below restates RULES.md in its simplest form, one line per rule.
 */
import { describe, expect, test } from '@jest/globals';
import {
    ANALYZE_EXPECTED,
    KNOWN_DEFECTS,
    REPORT_EXPECTED,
    textPath,
    ANALYZE_TEXT,
    REPORT_TEXT,
} from '../../test-harness/scenario/expected.js';
import {
    BILLS,
    BUDGETS,
    TAG_DISPOSABLE,
    TAG_PAYCHECK,
    TRANSACTIONS,
    transactionsInMonth,
} from '../../test-harness/scenario/ledger.js';
import {
    BILL_AMOUNT_AVG,
    CONTRACT_PAGE_LIMIT,
    NO_NAME_REVENUE,
    TRANSACTION_PAGINATION,
    TRANSACTIONS_BY_MONTH,
} from '../../test-harness/scenario/firefly-contract.js';
import { buildScenarioConfig, invalidConfigs } from '../../test-harness/scenario/config.js';
import { canonicalJson, markerTag, scenarioHash } from '../../test-harness/scenario/hash.js';
import type {
    AccountKey,
    AssertedMonthId,
    BudgetKey,
    MonthId,
    TransactionDef,
    TxKey,
} from '../../test-harness/scenario/types.js';

const ENVELOPE: AccountKey[] = ['CHK', 'CC', 'OLD']; // R-SCOPE-1: SAV/BRK/POOL untracked
const INCOME: AccountKey[] = ['CHK', 'OLD']; // R-INCOME-1: the envelope minus the card

const cents = (n: number) => Math.round(n * 100) / 100;
const sum = (ts: TransactionDef[], sign: (t: TransactionDef) => number = () => 1) =>
    cents(ts.reduce((s, t) => s + sign(t) * t.amount, 0));
/** withdrawals/transfers add, deposits subtract */
const spendSign = (t: TransactionDef) => (t.type === 'deposit' ? -1 : 1);
const keys = (ts: TransactionDef[]) => ts.map(t => t.key).sort();
const asset = (e: TransactionDef['source']) => ('asset' in e ? e.asset : undefined);
const inEnvelope = (e: TransactionDef['source']) => ENVELOPE.includes(asset(e)!);
const isExcluded = (t: TransactionDef) =>
    t.description.trim().toLowerCase() === 'annual membership deposit' && t.amount === 75;
const hasTag = (t: TransactionDef, tag: string) => t.tags.includes(tag);

type Bucket = 'paycheck' | 'additional' | 'bill' | 'disposable' | 'budget' | 'unbudgeted';

/** R-BUCKET-1: first match wins */
const byMarker = (t: TransactionDef): Bucket =>
    t.bill ? 'bill' : hasTag(t, TAG_DISPOSABLE) ? 'disposable' : t.budget ? 'budget' : 'unbudgeted';

function bucketOf(t: TransactionDef): Bucket | null {
    if (t.type === 'withdrawal') return inEnvelope(t.source) ? byMarker(t) : null; // R-SCOPE-2
    if (t.type === 'transfer') {
        // R-XFER-1/2 ignore; R-XFER-3 outbound is unbudgeted
        return inEnvelope(t.source) && !inEnvelope(t.destination) ? 'unbudgeted' : null;
    }
    if (!inEnvelope(t.destination)) return null; // R-INCOME-2
    const intoIncome = INCOME.includes(asset(t.destination)!);
    if (intoIncome && hasTag(t, TAG_PAYCHECK)) return 'paycheck'; // R-INCOME-1
    const marked = !!t.bill || hasTag(t, TAG_DISPOSABLE) || !!t.budget;
    if (marked || !intoIncome) return byMarker(t); // R-REFUND-1
    return 'additional'; // R-INCOME-1
}

function model(month: MonthId) {
    const all = transactionsInMonth(month).filter(t => !isExcluded(t)); // R-EXCL-1
    const bucket = (b: Bucket) => all.filter(t => bucketOf(t) === b);
    const paycheck = bucket('paycheck');
    const additional = bucket('additional');
    const bills = bucket('bill');
    const disposable = bucket('disposable');
    const budgeted = bucket('budget');
    const unbudgeted = bucket('unbudgeted');

    const [y, m] = month.split('-');
    const allocated = BUDGETS.reduce(
        (s, b) => s + (b.limits.find(l => l.month === `${y}-${m}`)?.amount ?? 0),
        0
    );
    const budgetSpent = sum(budgeted, spendSign);
    const billsActual = sum(bills, spendSign);
    // R-PURPOSE-1, R-DISP-1: disposable is not in the net
    const net = cents(
        sum(paycheck) + sum(additional) - billsActual - budgetSpent - sum(unbudgeted, spendSign)
    );
    const perBudget = (key: BudgetKey) =>
        sum(
            budgeted.filter(t => t.budget === key),
            spendSign
        );

    return {
        paycheck,
        additional,
        bills,
        billsActual,
        disposable,
        budgeted,
        budgetSpent,
        allocated,
        unbudgeted,
        net,
        perBudget,
    };
}

const PREV: Record<AssertedMonthId, MonthId> = {
    '2025-01': '2024-12',
    '2025-02': '2025-01',
    '2025-03': '2025-02',
};
const MONTHS = Object.keys(ANALYZE_EXPECTED) as AssertedMonthId[];

describe('ledger sanity', () => {
    test('transaction keys are unique', () => {
        const all = TRANSACTIONS.map(t => t.key);
        expect(new Set(all).size).toBe(all.length);
        expect(all).toHaveLength(45); // 33 Jan + 3 Dec + 4 Feb + 5 Mar
    });

    test('33 transaction groups in January', () => {
        expect(transactionsInMonth('2025-01')).toHaveLength(33);
    });

    test('budgets only on withdrawals (V8: Firefly drops them elsewhere)', () => {
        expect(TRANSACTIONS.filter(t => t.budget && t.type !== 'withdrawal')).toEqual([]);
    });

    test('endpoints fit the type: withdrawals asset->name, deposits name->asset, transfers asset->asset', () => {
        for (const t of TRANSACTIONS) {
            const shape = `${'asset' in t.source ? 'A' : 'N'}${'asset' in t.destination ? 'A' : 'N'}`;
            expect({ key: t.key, shape }).toEqual({
                key: t.key,
                shape: { withdrawal: 'AN', deposit: 'NA', transfer: 'AA' }[t.type],
            });
        }
    });

    test('[R-EXCL-1] exactly one transaction matches the exclusion rule', () => {
        expect(keys(TRANSACTIONS.filter(isExcluded))).toEqual(['T25']);
    });

    test('amounts are positive with at most two decimals', () => {
        for (const t of TRANSACTIONS) {
            expect(t.amount).toBeGreaterThan(0);
            expect(cents(t.amount)).toBe(t.amount);
        }
    });
});

describe.each(MONTHS)('analyze %s literals match the ledger', month => {
    const e = ANALYZE_EXPECTED[month];
    const mo = model(month);

    test('[R-INCOME-1] [R-INCOME-2] paycheck', () => {
        expect(e.paycheck.actual).toBe(sum(mo.paycheck));
        expect(e.paycheck.variance).toBe(cents(e.paycheck.actual - e.paycheck.expected));
    });
    test('[R-INCOME-1] [R-REFUND-1] additional income', () => {
        expect(e.additionalIncome.total).toBe(sum(mo.additional));
        expect(sorted(e.additionalIncome.transactions)).toEqual(keys(mo.additional));
    });
    test('[R-XFER-1] [R-XFER-2] [R-XFER-3] [R-REFUND-1] unbudgeted', () => {
        expect(e.unbudgetedExpenses.total).toBe(sum(mo.unbudgeted, spendSign));
        expect(sorted(e.unbudgetedExpenses.transactions)).toEqual(keys(mo.unbudgeted));
    });
    test('[R-BUDGET-1] [R-SCOPE-2] budget', () => {
        expect(e.budget.allocated).toBe(mo.allocated);
        expect(e.budget.spent).toBe(mo.budgetSpent);
        expect(e.budget.remaining).toBe(cents(mo.allocated - mo.budgetSpent));
    });
    test('[R-BILL-1] bills', () => {
        expect(e.bills.actual).toBe(mo.billsActual);
        expect(e.bills.variance).toBe(cents(e.bills.actual - e.bills.predicted));
        const rows = Object.values(e.bills.rows).filter(r => r !== undefined);
        expect(cents(rows.reduce((s, r) => s + r.predicted, 0))).toBe(e.bills.predicted);
        expect(cents(rows.reduce((s, r) => s + r.actual, 0))).toBe(e.bills.actual);
        // Every scenario bill is monthly: an active bill falls due once in
        // every month on its schedule, an inactive one never
        for (const bill of BILLS) {
            const row = e.bills.rows[bill.key];
            const linked = mo.bills.filter(t => t.bill === bill.key);
            if (bill.deactivateAfterSeed && linked.length === 0) {
                expect(row).toBeUndefined(); // no due date, no counted activity: no row
                continue;
            }
            expect(row).toEqual({
                name: bill.name,
                predicted: bill.deactivateAfterSeed ? 0 : bill.amountMin,
                actual: sum(linked, spendSign),
                frequency: bill.repeatFreq,
            });
        }
    });
    test('[R-DISP-1] disposable', () => {
        const balance = sum(mo.disposable, spendSign);
        expect(e.disposable.balance).toBe(balance);
        expect(sorted(e.disposable.transactions)).toEqual(keys(mo.disposable));
        expect(e.disposable.action).toEqual(
            balance > 0
                ? { direction: 'fromPool', amount: balance }
                : balance < 0
                  ? { direction: 'toPool', amount: -balance }
                  : null
        );
    });
    test('[R-PURPOSE-1] net cash flow', () => {
        expect(e.netCashFlow).toBe(mo.net);
        // Restated from the literals themselves, too
        expect(e.netCashFlow).toBe(
            cents(
                e.paycheck.actual +
                    e.additionalIncome.total -
                    e.bills.actual -
                    e.budget.spent -
                    e.unbudgetedExpenses.total
            )
        );
    });
    test('text Net Cash Flow line agrees with the literal', () => {
        expect(ANALYZE_TEXT[month].lines.map(l => l.line)).toContain(
            `Net Cash Flow: +$${e.netCashFlow.toFixed(2)} ✓`
        );
    });
});

describe.each(MONTHS)('report %s literals match the ledger', month => {
    const r = REPORT_EXPECTED[month];
    const a = ANALYZE_EXPECTED[month];
    const mo = model(month);
    const prev = model(PREV[month]);

    test('[R-BUDGET-1] per-budget rows', () => {
        for (const b of BUDGETS) {
            const allocated = b.limits.find(l => l.month === month)?.amount ?? 0;
            const spent = mo.perBudget(b.key);
            const previous = prev.perBudget(b.key);
            const pct = allocated > 0 ? cents((spent / allocated) * 100) : 0;
            expect({ key: b.key, ...r.budgets[b.key] }).toEqual({
                key: b.key,
                name: b.name,
                allocated,
                spent,
                remaining: cents(allocated - spent),
                percentageUsed: pct,
                status:
                    spent > allocated && allocated > 0 ? 'over' : pct >= 85 ? 'on-track' : 'under',
                previousMonthSpent: previous,
                averageSpent: cents((spent + previous) / 2),
            });
        }
    });
    test('totals', () => {
        expect(r.totals.allocated).toBe(mo.allocated);
        expect(r.totals.spent).toBe(mo.budgetSpent);
        expect(r.totals.percentageUsed).toBe(cents((mo.budgetSpent / mo.allocated) * 100));
    });
    test('bills and unbudgeted agree with analyze', () => {
        expect(r.bills).toEqual({
            predicted: a.bills.predicted,
            actual: a.bills.actual,
            variance: a.bills.variance,
        });
        expect(r.unbudgetedExpenses).toEqual(a.unbudgetedExpenses);
    });
});

describe('firefly-contract literals match the ledger', () => {
    const ALL: MonthId[] = ['2024-12', '2025-01', '2025-02', '2025-03'];

    test.each(ALL)('%s transactions and pagination', month => {
        const inMonth = transactionsInMonth(month);
        expect(sorted(TRANSACTIONS_BY_MONTH[month])).toEqual(keys(inMonth));
        expect(TRANSACTION_PAGINATION[month]).toEqual({
            total: inMonth.length,
            totalPages: Math.ceil(inMonth.length / CONTRACT_PAGE_LIMIT),
        });
    });

    test('(no name) deposits are exactly the payroll deposits', () => {
        expect(sorted(NO_NAME_REVENUE.transactions)).toEqual(
            keys(TRANSACTIONS.filter(t => 'name' in t.source && t.source.name === '(no name)'))
        );
    });

    test('amount_avg is the min/max midpoint', () => {
        for (const b of BILLS) {
            expect(BILL_AMOUNT_AVG[b.key]).toBe((b.amountMin + b.amountMax) / 2);
        }
    });
});

describe('KNOWN_DEFECTS', () => {
    const at = (obj: unknown, path: string): unknown =>
        path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);

    test('each entry restates its literal and differs from the code', () => {
        for (const d of KNOWN_DEFECTS) {
            if (d.fieldPath.startsWith('text:')) {
                const text = d.command === 'analyze' ? ANALYZE_TEXT[d.month] : REPORT_TEXT[d.month];
                expect(text.lines.map(l => textPath(l.section, l.line))).toContain(d.fieldPath);
                continue;
            }
            const literal =
                d.command === 'analyze' ? ANALYZE_EXPECTED[d.month] : REPORT_EXPECTED[d.month];
            expect(at(literal, d.fieldPath)).toEqual(d.expected);
            expect(d.codeToday).not.toEqual(d.expected);
        }
    });
});

describe('config and hash', () => {
    const idMap = {
        accounts: { CHK: '1', CC: '2', SAV: '3', BRK: '4', POOL: '5', OLD: '6' },
    };

    test('[R-SCOPE-1] config draws the envelope with untrackedAccounts alone', () => {
        const c = buildScenarioConfig(idMap);
        expect(c).toEqual({
            expectedMonthlyPaycheck: 2100,
            untrackedAccounts: ['3', '4', '5'],
            excludedTransactions: [
                {
                    description: 'Annual Membership Deposit',
                    amount: '75.00',
                    reason: 'refundable deposit',
                },
            ],
        });
        expect(c).not.toHaveProperty('tags');
    });

    test('invalid configs', () => {
        const cases = invalidConfigs(idMap);
        expect(cases.map(c => c.name)).toEqual([
            'amount-only exclusion',
            'malformed exclusion amount',
            'missing expectedMonthlyPaycheck',
        ]);
        expect(cases[2].config).not.toHaveProperty('expectedMonthlyPaycheck');
    });

    test('hash is deterministic, sha256 hex, and key-order independent', () => {
        expect(scenarioHash()).toMatch(/^[0-9a-f]{64}$/);
        expect(scenarioHash()).toBe(scenarioHash());
        expect(markerTag()).toBe(`btk-e2e-seed-${scenarioHash().slice(0, 16)}`);
        expect(canonicalJson({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe(
            canonicalJson({ a: [2, { d: 3 }], b: 1 })
        );
    });
});

function sorted(values: readonly TxKey[]): TxKey[] {
    return [...values].sort();
}
