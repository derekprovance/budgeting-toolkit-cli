/**
 * The scenario ledger: the single source of truth for what gets seeded.
 *
 * Declarative only. A seeder (real or fake Firefly) creates, in order:
 *   1. tags, asset accounts, budgets + per-month limits, bills
 *   2. every transaction below, with `apply_rules: false`
 *   3. the post-seed deactivations (`deactivateAfterSeed`)
 *
 * Changing anything here changes `scenarioHash()`, which invalidates a reused
 * e2e database on purpose.
 */
import type {
    AssetAccountDef,
    BillDef,
    BudgetDef,
    MonthId,
    ScenarioLedger,
    TransactionDef,
    TxKey,
} from './types.js';

export const TAG_PAYCHECK = 'Paycheck';
export const TAG_DISPOSABLE = 'Disposable Income';

/** Marker tag prefix; the full tag is `${MARKER_TAG_PREFIX}${scenarioHash()}` */
export const MARKER_TAG_PREFIX = 'btk-e2e-seed-';

export const ACCOUNTS: AssetAccountDef[] = [
    {
        key: 'CHK',
        name: 'E2E Checking',
        type: 'asset',
        accountRole: 'defaultAsset',
        currencyCode: 'USD',
        openingBalance: null,
        deactivateAfterSeed: false,
    },
    {
        key: 'CC',
        name: 'E2E Credit Card',
        type: 'asset',
        accountRole: 'ccAsset',
        currencyCode: 'USD',
        creditCardType: 'monthlyFull', // required (V6); reads back null
        monthlyPaymentDate: '2025-01-25', // required (V6); reads back null
        openingBalance: null,
        deactivateAfterSeed: false,
    },
    {
        key: 'SAV',
        name: 'E2E Savings',
        type: 'asset',
        accountRole: 'savingAsset',
        currencyCode: 'USD',
        openingBalance: null,
        deactivateAfterSeed: false,
    },
    {
        key: 'BRK',
        name: 'E2E Brokerage',
        type: 'asset',
        accountRole: 'savingAsset',
        currencyCode: 'USD',
        openingBalance: null,
        deactivateAfterSeed: false,
    },
    {
        key: 'POOL',
        name: 'E2E Disposable Pool',
        type: 'asset',
        accountRole: 'savingAsset',
        currencyCode: 'USD',
        openingBalance: null,
        deactivateAfterSeed: false,
    },
    {
        key: 'OLD',
        name: 'E2E Old Checking',
        type: 'asset',
        accountRole: 'defaultAsset',
        currencyCode: 'USD',
        openingBalance: null,
        deactivateAfterSeed: true,
    },
];

export const BILLS: BillDef[] = [
    {
        key: 'B_ELEC',
        name: 'Electric',
        amountMin: 100,
        amountMax: 100,
        date: '2024-12-10',
        repeatFreq: 'monthly',
        currencyCode: 'USD',
        deactivateAfterSeed: false,
    },
    {
        key: 'B_NET',
        name: 'Internet',
        amountMin: 60,
        amountMax: 60,
        date: '2024-12-12',
        repeatFreq: 'monthly',
        currencyCode: 'USD',
        deactivateAfterSeed: false,
    },
    {
        key: 'B_GYM',
        name: 'Old Gym',
        amountMin: 40,
        amountMax: 40,
        date: '2024-12-05',
        repeatFreq: 'monthly',
        currencyCode: 'USD',
        deactivateAfterSeed: true,
    },
    {
        key: 'B_INS',
        name: 'Insurance',
        amountMin: 80,
        amountMax: 80,
        date: '2024-12-06',
        repeatFreq: 'monthly',
        currencyCode: 'USD',
        deactivateAfterSeed: false,
    },
];

export const BUDGETS: BudgetDef[] = [
    {
        key: 'Groceries',
        name: 'Groceries',
        limits: [
            { month: '2024-12', amount: 400 },
            { month: '2025-01', amount: 400 },
            { month: '2025-02', amount: 400 },
            { month: '2025-03', amount: 400 },
        ],
    },
    { key: 'Dining', name: 'Dining', limits: [{ month: '2025-01', amount: 150 }] },
    { key: 'Utilities', name: 'Utilities', limits: [{ month: '2025-01', amount: 100 }] },
    { key: 'Fun', name: 'Fun', limits: [{ month: '2025-01', amount: 50 }] },
];

const P = TAG_PAYCHECK;
const D = TAG_DISPOSABLE;
const PAYROLL = 'ACME CORP PAYROLL';
/**
 * Payroll arrives from Firefly's catch-all revenue account in real data. A
 * deposit stored with NO source lands on "Cash account" instead (V12), so the
 * name is set explicitly.
 */
const NO_NAME = { name: '(no name)' };

// prettier-ignore
export const TRANSACTIONS: TransactionDef[] = [
    // ── 2024-12: history and bleed-over (all on the 31st) ────────────────────
    { key: 'D1', date: '2024-12-31', type: 'withdrawal', amount: 500, description: 'Grocer', source: { asset: 'CC' }, destination: { name: 'Grocer' }, budget: 'Groceries', tags: [], note: 'Dec Groceries history for averageSpent; must not bleed into Jan' },
    { key: 'D2', date: '2024-12-31', type: 'deposit', amount: 999, description: PAYROLL, source: NO_NAME, destination: { asset: 'CHK' }, tags: [P], note: 'Dec paycheck on the last day; must not bleed into Jan' },
    { key: 'D3', date: '2024-12-31', type: 'withdrawal', amount: 70, description: 'Hardware Store', source: { asset: 'CC' }, destination: { name: 'Hardware Store' }, tags: [], note: 'Dec unbudgeted; must not bleed into Jan' },

    // ── 2025-01: the main month ──────────────────────────────────────────────
    // Income side
    { key: 'T01', date: '2025-01-01', type: 'deposit', amount: 1000, description: PAYROLL, source: NO_NAME, destination: { asset: 'CHK' }, tags: [P], note: 'Paycheck, checking half; first-day boundary' },
    { key: 'T02', date: '2025-01-01', type: 'deposit', amount: 1500, description: PAYROLL, source: NO_NAME, destination: { asset: 'SAV' }, tags: [P], note: 'Savings half carrying a STRAY Paycheck tag: outside, counted nowhere (R-INCOME-2)' },
    { key: 'T03', date: '2025-01-15', type: 'deposit', amount: 1000, description: PAYROLL, source: NO_NAME, destination: { asset: 'CHK' }, tags: [P], note: 'Paycheck, checking half' },
    { key: 'T04', date: '2025-01-15', type: 'deposit', amount: 1500, description: PAYROLL, source: NO_NAME, destination: { asset: 'SAV' }, tags: [], note: 'Savings half, untagged: outside, counted nowhere (R-INCOME-2)' },
    { key: 'T05', date: '2025-01-20', type: 'deposit', amount: 300, description: 'Freelance Invoice 17', source: { name: 'Side Client' }, destination: { asset: 'CHK' }, tags: [], note: 'Additional income (R-INCOME-1)' },
    { key: 'T06', date: '2025-01-22', type: 'deposit', amount: 45, description: 'Venmo Transfer', source: { name: 'Venmo' }, destination: { asset: 'CHK' }, tags: [], note: 'Venmo reimbursement: additional income (R-INCOME-1)' },
    { key: 'T07', date: '2025-01-23', type: 'deposit', amount: 120, description: 'Transferwise Payout', source: { name: 'Transferwise' }, destination: { asset: 'CHK' }, tags: [], note: 'Additional income (R-INCOME-1)' },
    { key: 'T08', date: '2025-01-31', type: 'deposit', amount: 12.34, description: 'Interest Payment', source: { name: 'Savings Bank' }, destination: { asset: 'SAV' }, tags: [], note: 'Savings interest: outside, never income (R-INCOME-2); last-day boundary' },
    { key: 'T09', date: '2025-01-12', type: 'deposit', amount: 25, description: 'Grocer Refund', source: { name: 'Grocer' }, destination: { asset: 'CC' }, tags: [], note: 'Unmarked card refund: reduces unbudgeted (R-REFUND-1)' },
    { key: 'T10', date: '2025-01-10', type: 'transfer', amount: 500, description: 'Savings Top-up', source: { asset: 'SAV' }, destination: { asset: 'CHK' }, tags: [], note: 'Top-up from savings: inbound transfer, ignored (R-XFER-2)' },
    { key: 'T11', date: '2025-01-25', type: 'transfer', amount: 1200, description: 'Credit Card Payment', source: { asset: 'CHK' }, destination: { asset: 'CC' }, tags: [], note: 'Card payment: transfer inside the envelope, ignored (R-XFER-1)' },
    { key: 'T12', date: '2025-01-31', type: 'transfer', amount: 85, description: 'Disposable Draw', source: { asset: 'POOL' }, destination: { asset: 'CHK' }, tags: [], note: 'Pool reimbursement: inbound transfer, ignored (R-XFER-2)' },
    // Budgeted spending
    { key: 'T13', date: '2025-01-03', type: 'withdrawal', amount: 80, description: 'Grocer', source: { asset: 'CC' }, destination: { name: 'Grocer' }, budget: 'Groceries', tags: [], note: 'Budgeted card purchase' },
    { key: 'T14', date: '2025-01-17', type: 'withdrawal', amount: 120, description: 'Grocer', source: { asset: 'CC' }, destination: { name: 'Grocer' }, budget: 'Groceries', tags: [], note: 'Budgeted card purchase' },
    { key: 'T15', date: '2025-01-08', type: 'withdrawal', amount: 45, description: 'Bistro', source: { asset: 'CC' }, destination: { name: 'Bistro' }, budget: 'Dining', tags: [], note: 'Budgeted card purchase' },
    // Unbudgeted spending
    { key: 'T16', date: '2025-01-09', type: 'withdrawal', amount: 35, description: 'Hardware Store', source: { asset: 'CC' }, destination: { name: 'Hardware Store' }, tags: [], note: 'Unbudgeted card purchase' },
    { key: 'T17', date: '2025-01-19', type: 'withdrawal', amount: 15, description: 'City Parking', source: { asset: 'CHK' }, destination: { name: 'City Parking' }, tags: [], note: 'Unbudgeted checking purchase' },
    // Disposable
    { key: 'T18', date: '2025-01-11', type: 'withdrawal', amount: 60, description: 'Concert Tickets', source: { asset: 'CC' }, destination: { name: 'Concert Venue' }, tags: [D], note: 'Disposable purchase' },
    { key: 'T19', date: '2025-01-14', type: 'withdrawal', amount: 40, description: 'Bookstore', source: { asset: 'CC' }, destination: { name: 'Bookstore' }, budget: 'Fun', tags: [D], note: 'Disposable purchase that ALSO carries a budget: disposable wins (R-BUCKET-1)' },
    { key: 'T20', date: '2025-01-21', type: 'deposit', amount: 20, description: 'Concert Tickets Refund', source: { name: 'Concert Venue' }, destination: { asset: 'CC' }, tags: [D], note: 'Disposable refund: reduces disposable (R-REFUND-1)' },
    // Bills
    { key: 'T21', date: '2025-01-10', type: 'withdrawal', amount: 110, description: 'Electric Co', source: { asset: 'CHK' }, destination: { name: 'Electric Co' }, bill: 'B_ELEC', tags: [], note: 'Bill paid above its average' },
    { key: 'T22', date: '2025-01-12', type: 'withdrawal', amount: 60, description: 'Internet Co', source: { asset: 'CC' }, destination: { name: 'Internet Co' }, budget: 'Utilities', bill: 'B_NET', tags: [], note: 'Bill that ALSO carries a budget: bill wins (R-BUCKET-1)' },
    { key: 'T23', date: '2025-01-05', type: 'withdrawal', amount: 40, description: 'Old Gym', source: { asset: 'CHK' }, destination: { name: 'Old Gym' }, bill: 'B_GYM', tags: [], note: 'Linked to a bill deactivated after seeding: still a bill' },
    { key: 'T24', date: '2025-01-06', type: 'withdrawal', amount: 80, description: 'Insurance Co', source: { asset: 'POOL' }, destination: { name: 'Insurance Co' }, bill: 'B_INS', tags: [], note: 'Bill paid straight from the pool: outside, not counted (R-SCOPE-2)' },
    // Exclusions
    { key: 'T25', date: '2025-01-07', type: 'withdrawal', amount: 75, description: 'Annual Membership Deposit', source: { asset: 'CC' }, destination: { name: 'Membership Club' }, budget: 'Dining', tags: [], note: 'Matches excludedTransactions (description + 75.00); gone everywhere (R-EXCL-1)' },
    { key: 'T26', date: '2025-01-27', type: 'withdrawal', amount: 30, description: 'Annual Membership Deposit', source: { asset: 'CC' }, destination: { name: 'Membership Club' }, tags: [], note: 'Near-miss: same description, different amount; counts' },
    // Untracked accounts and pairs
    { key: 'T27', date: '2025-01-16', type: 'withdrawal', amount: 250, description: 'IRS Estimated Tax', source: { asset: 'SAV' }, destination: { name: 'IRS' }, tags: [], note: 'Unmarked savings withdrawal: outside, not shown' },
    { key: 'T28', date: '2025-01-18', type: 'withdrawal', amount: 1000, description: 'Vanguard Fund Purchase', source: { asset: 'BRK' }, destination: { name: 'Vanguard' }, tags: [], note: 'Brokerage withdrawal: outside, not shown' },
    { key: 'T29', date: '2025-01-28', type: 'transfer', amount: 150, description: '529 Contribution', source: { asset: 'CHK' }, destination: { asset: 'BRK' }, tags: [], note: 'Transfer out of the envelope to the brokerage: unbudgeted (R-XFER-3)' },
    { key: 'T30', date: '2025-01-29', type: 'transfer', amount: 200, description: 'Move to Savings', source: { asset: 'CHK' }, destination: { asset: 'SAV' }, tags: [], note: 'Transfer out of the envelope to savings: unbudgeted (R-XFER-3)' },
    { key: 'T31', date: '2025-01-04', type: 'withdrawal', amount: 22, description: 'Corner Coffee', source: { asset: 'OLD' }, destination: { name: 'Corner Coffee' }, tags: [], note: 'From an account deactivated after seeding: still in the envelope (R-SCOPE-1), unbudgeted' },
    // Boundaries
    { key: 'T32', date: '2025-01-31', type: 'withdrawal', amount: 20, description: 'Grocer', source: { asset: 'CC' }, destination: { name: 'Grocer' }, budget: 'Groceries', tags: [], note: 'Last-day boundary, budgeted' },
    { key: 'T33', date: '2025-01-01', type: 'withdrawal', amount: 9, description: 'Corner Coffee', source: { asset: 'CC' }, destination: { name: 'Corner Coffee' }, tags: [], note: 'First-day boundary, unbudgeted' },

    // ── 2025-02: Scenario B, negative disposable ─────────────────────────────
    { key: 'F1', date: '2025-02-01', type: 'deposit', amount: 1000, description: PAYROLL, source: NO_NAME, destination: { asset: 'CHK' }, tags: [P], note: 'Paycheck' },
    { key: 'F2', date: '2025-02-03', type: 'withdrawal', amount: 30, description: 'Bookstore', source: { asset: 'CC' }, destination: { name: 'Bookstore' }, tags: [D], note: 'Disposable purchase' },
    { key: 'F3', date: '2025-02-10', type: 'deposit', amount: 50, description: 'Bookstore Refund', source: { name: 'Bookstore' }, destination: { asset: 'CC' }, tags: [D], note: 'Disposable refund larger than the purchase' },
    { key: 'F4', date: '2025-02-05', type: 'withdrawal', amount: 100, description: 'Grocer', source: { asset: 'CC' }, destination: { name: 'Grocer' }, budget: 'Groceries', tags: [], note: 'Budgeted' },

    // ── 2025-03: Scenario C, accounts first (R-SCOPE-2, R-INCOME-2) ───────────
    { key: 'M1', date: '2025-03-01', type: 'deposit', amount: 1000, description: PAYROLL, source: NO_NAME, destination: { asset: 'CHK' }, tags: [P], note: 'Paycheck' },
    { key: 'M2', date: '2025-03-10', type: 'withdrawal', amount: 200, description: 'IRS Estimated Tax', source: { asset: 'SAV' }, destination: { name: 'IRS' }, budget: 'Groceries', tags: [], note: 'Budgeted savings withdrawal: outside, not counted (R-SCOPE-2)' },
    { key: 'M3', date: '2025-03-12', type: 'withdrawal', amount: 60, description: 'Grocer', source: { asset: 'CC' }, destination: { name: 'Grocer' }, budget: 'Groceries', tags: [], note: 'Budgeted' },
    { key: 'M4', date: '2025-03-14', type: 'withdrawal', amount: 15, description: 'Bookstore', source: { asset: 'SAV' }, destination: { name: 'Bookstore' }, tags: [D], note: 'Disposable-tagged savings withdrawal: outside, not counted (R-SCOPE-2)' },
    { key: 'M5', date: '2025-03-31', type: 'deposit', amount: 5, description: 'Interest Payment', source: { name: 'Savings Bank' }, destination: { asset: 'POOL' }, tags: [], note: 'Pool interest: the pool is outside, never income (R-INCOME-2)' },
];

export const LEDGER: ScenarioLedger = {
    accounts: ACCOUNTS,
    bills: BILLS,
    budgets: BUDGETS,
    tags: [TAG_PAYCHECK, TAG_DISPOSABLE],
    transactions: TRANSACTIONS,
};

/** Looks up one transaction by key; throws on an unknown key */
export function tx(key: TxKey): TransactionDef {
    const found = TRANSACTIONS.find(t => t.key === key);
    if (!found) {
        throw new Error(`Unknown scenario transaction key: ${key}`);
    }
    return found;
}

/** Transactions dated in the given month (by the YYYY-MM prefix of `date`) */
export function transactionsInMonth(month: MonthId): TransactionDef[] {
    return TRANSACTIONS.filter(t => t.date.startsWith(`${month}-`));
}

/** `{ month, year }` for a MonthId */
export function monthParts(month: MonthId): { month: number; year: number } {
    const [year, m] = month.split('-').map(Number);
    return { month: m, year };
}
