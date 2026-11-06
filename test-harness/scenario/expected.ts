/**
 * Expected results for the scenario, HAND-DERIVED from RULES.md. Nothing here
 * is computed by src/ logic; every number is a literal with its derivation next
 * to it. Rule ids (R-…) point at the rule each derivation applies.
 *
 * Where today's code disagrees, the literal still encodes RULES.md and the
 * field is listed in KNOWN_DEFECTS, which turns its test into `test.failing`.
 *
 * Scenario facts used throughout:
 *   envelope        = CHK, CC, OLD (SAV, BRK, POOL untracked)            R-SCOPE-1
 *   income accounts = CHK, OLD (the envelope minus the ccAsset card)     R-INCOME-1
 *   excluded        = T25 only ("Annual Membership Deposit" at 75.00)    R-EXCL-1
 */
import type { AssertedMonthId, BillKey, BudgetKey, TxKey } from './types.js';

export interface ExpectedTxBucket {
    total: number;
    /** Order-insensitive set of scenario keys */
    transactions: TxKey[];
}

export interface ExpectedBillRow {
    name: string;
    predicted: number;
    actual: number;
    frequency: string;
}

export interface ExpectedAnalyze {
    schemaVersion: 2;
    month: number;
    year: number;
    currencyCode: string;
    currencySymbol: string;
    paycheck: { expected: number; actual: number; variance: number };
    additionalIncome: ExpectedTxBucket;
    unbudgetedExpenses: ExpectedTxBucket;
    budget: { allocated: number; spent: number; remaining: number };
    bills: {
        predicted: number;
        actual: number;
        variance: number;
        /** Exactly these rows, keyed by bill */
        rows: Partial<Record<BillKey, ExpectedBillRow>>;
    };
    disposable: {
        balance: number;
        transactions: TxKey[];
        action: { direction: 'fromPool' | 'toPool'; amount: number } | null;
    };
    netCashFlow: number;
}

export interface ExpectedBudgetRow {
    name: string;
    allocated: number;
    spent: number;
    remaining: number;
    /** Rounded to 2 decimals, as the JSON contract emits it */
    percentageUsed: number;
    status: 'over' | 'on-track' | 'under';
    previousMonthSpent: number;
    averageSpent: number;
}

export interface ExpectedReport {
    schemaVersion: 2;
    month: number;
    year: number;
    currencySymbol: string;
    totals: { spent: number; allocated: number; percentageUsed: number };
    budgets: Record<BudgetKey, ExpectedBudgetRow>;
    bills: { predicted: number; actual: number; variance: number };
    unbudgetedExpenses: ExpectedTxBucket;
}

export const ANALYZE_EXPECTED: Record<AssertedMonthId, ExpectedAnalyze> = {
    '2025-01': {
        schemaVersion: 2,
        month: 1,
        year: 2025,
        currencyCode: 'USD', // primary currency set to USD by the seeder (V13)
        currencySymbol: '$',
        paycheck: {
            expected: 2100, // config expectedMonthlyPaycheck
            // T01 1000 + T03 1000: tagged deposits into CHK. T02 carries the tag
            // but lands in SAV, outside (R-INCOME-2). D2 is 2024-12-31 (R-TIME-1).
            actual: 2000,
            variance: -100, // 2000 - 2100
        },
        additionalIncome: {
            // Unmarked deposits into CHK (R-INCOME-1): T05 300 + T06 45 + T07 120.
            // Not: T02/T04/T08 (SAV, outside); T09/T20 (onto the card, refunds);
            //      T10/T12 (transfers, R-XFER-2).
            total: 465,
            transactions: ['T05', 'T06', 'T07'],
        },
        unbudgetedExpenses: {
            // Unmarked envelope withdrawals (R-BUCKET-1):
            //   T16 35 CC, T17 15 CHK, T26 30 CC (near-miss exclusion), T33 9 CC
            // Transfers out of the envelope (R-XFER-3):
            //   T29 150 CHK->BRK, T30 200 CHK->SAV
            //   T31 22 OLD: inactive, but still in the envelope (R-SCOPE-1)
            // Unmarked card refund (R-REFUND-1): T09 -25
            // Not: T27 SAV, T28 BRK (outside); T11 CHK->CC (R-XFER-1);
            //      T25 (excluded, R-EXCL-1).
            // 35 + 15 + 30 + 9 + 22 + 150 + 200 - 25 = 436
            total: 436,
            transactions: ['T09', 'T16', 'T17', 'T26', 'T29', 'T30', 'T31', 'T33'],
        },
        budget: {
            allocated: 700, // 400 + 150 + 100 + 50
            // Budgeted envelope withdrawals not claimed by a bill or the tag
            // (R-BUCKET-1, R-BUDGET-1): Groceries T13 80 + T14 120 + T32 20 = 220;
            // Dining T15 45 (T25 excluded). T22 is a bill, T19 disposable.
            // 220 + 45 = 265
            spent: 265,
            remaining: 435, // 700 - 265
        },
        bills: {
            // Bill-linked envelope withdrawals (R-BILL-1): T21 110 + T22 60 +
            // T23 40 = 210. T24 is paid from the pool: outside (R-SCOPE-2).
            // Predicted: every active bill falls due once a month on its
            // schedule; inactive Old Gym predicts 0. Insurance is expected but
            // paid from outside, so nothing counts against it.
            predicted: 240, // 100 + 60 + 0 + 80
            actual: 210,
            variance: -30, // 210 - 240
            rows: {
                B_ELEC: { name: 'Electric', predicted: 100, actual: 110, frequency: 'monthly' },
                B_NET: { name: 'Internet', predicted: 60, actual: 60, frequency: 'monthly' },
                B_GYM: { name: 'Old Gym', predicted: 0, actual: 40, frequency: 'monthly' },
                B_INS: { name: 'Insurance', predicted: 80, actual: 0, frequency: 'monthly' },
            },
        },
        disposable: {
            // Tagged, not a bill (R-BUCKET-1), refund netted (R-REFUND-1):
            // T18 60 + T19 40 - T20 20 = 80
            balance: 80,
            transactions: ['T18', 'T19', 'T20'],
            action: { direction: 'fromPool', amount: 80 },
        },
        // paycheck + additional - bills - budget - unbudgeted (R-PURPOSE-1);
        // disposable is not in the net (R-DISP-1).
        // 2000 + 465 - 210 - 265 - 436 = 1554
        netCashFlow: 1554,
    },

    '2025-02': {
        schemaVersion: 2,
        month: 2,
        year: 2025,
        currencyCode: 'USD',
        currencySymbol: '$',
        paycheck: {
            expected: 2100,
            actual: 1000, // F1
            variance: -1100, // 1000 - 2100
        },
        // F3 is a tagged deposit onto the card: a disposable refund, not income
        additionalIncome: { total: 0, transactions: [] },
        // F2 is tagged, F4 budgeted: nothing unmarked
        unbudgetedExpenses: { total: 0, transactions: [] },
        budget: {
            allocated: 400, // only Groceries has a February limit
            spent: 100, // F4
            remaining: 300, // 400 - 100
        },
        bills: {
            // Electric, Internet, Insurance fall due (02-10, 02-12, 02-06);
            // Old Gym is inactive with no activity: no row at all.
            predicted: 240, // 100 + 60 + 80
            actual: 0,
            variance: -240, // 0 - 240
            rows: {
                B_ELEC: { name: 'Electric', predicted: 100, actual: 0, frequency: 'monthly' },
                B_NET: { name: 'Internet', predicted: 60, actual: 0, frequency: 'monthly' },
                B_INS: { name: 'Insurance', predicted: 80, actual: 0, frequency: 'monthly' },
            },
        },
        disposable: {
            // F2 30 - F3 50 = -20: refunds outran spending, owed back to the pool
            balance: -20,
            transactions: ['F2', 'F3'],
            action: { direction: 'toPool', amount: 20 },
        },
        // 1000 + 0 - 0 - 100 - 0 = 900 (disposable is not in the net)
        netCashFlow: 900,
    },

    '2025-03': {
        schemaVersion: 2,
        month: 3,
        year: 2025,
        currencyCode: 'USD',
        currencySymbol: '$',
        paycheck: {
            expected: 2100,
            actual: 1000, // M1
            variance: -1100,
        },
        // M5 is pool interest: the pool is outside, never income (R-INCOME-2)
        additionalIncome: { total: 0, transactions: [] },
        // M3 is budgeted; M2 and M4 come from SAV, outside (R-SCOPE-2)
        unbudgetedExpenses: { total: 0, transactions: [] },
        budget: {
            allocated: 400, // Groceries only
            // M3 60. M2 carries Groceries but comes from SAV: outside (R-SCOPE-2)
            spent: 60,
            remaining: 340, // 400 - 60
        },
        bills: {
            predicted: 240, // 100 + 60 + 80 (03-10, 03-12, 03-06)
            actual: 0,
            variance: -240,
            rows: {
                B_ELEC: { name: 'Electric', predicted: 100, actual: 0, frequency: 'monthly' },
                B_NET: { name: 'Internet', predicted: 60, actual: 0, frequency: 'monthly' },
                B_INS: { name: 'Insurance', predicted: 80, actual: 0, frequency: 'monthly' },
            },
        },
        disposable: {
            // M4 is tagged but comes from SAV: outside (R-SCOPE-2)
            balance: 0,
            transactions: [],
            action: null,
        },
        // 1000 + 0 - 0 - 60 - 0 = 940
        netCashFlow: 940,
    },
};

// Report budget rows are the same budget bucket analyze uses (R-BUDGET-1),
// grouped by budget, for every active budget, with one month of history:
// previousMonthSpent is the prior month's bucket, averageSpent =
// (current + previous) / 2. status: 'over' when spent > limit, 'on-track' at
// >= 85%, else 'under'.

export const REPORT_EXPECTED: Record<AssertedMonthId, ExpectedReport> = {
    '2025-01': {
        schemaVersion: 2,
        month: 1,
        year: 2025,
        currencySymbol: '$',
        totals: {
            spent: 265, // 220 + 45 + 0 + 0
            allocated: 700,
            percentageUsed: 37.86, // 265 / 700 = 37.857142%
        },
        budgets: {
            Groceries: {
                name: 'Groceries',
                allocated: 400,
                spent: 220, // T13 80 + T14 120 + T32 20
                remaining: 180,
                percentageUsed: 55, // 220 / 400
                status: 'under',
                previousMonthSpent: 500, // D1
                averageSpent: 360, // (220 + 500) / 2
            },
            Dining: {
                name: 'Dining',
                allocated: 150,
                spent: 45, // T15 (T25 excluded, R-EXCL-1)
                remaining: 105,
                percentageUsed: 30, // 45 / 150
                status: 'under',
                previousMonthSpent: 0,
                averageSpent: 22.5, // (45 + 0) / 2
            },
            Utilities: {
                name: 'Utilities',
                allocated: 100,
                spent: 0, // T22 is a bill (R-BUCKET-1)
                remaining: 100,
                percentageUsed: 0,
                status: 'under',
                previousMonthSpent: 0,
                averageSpent: 0,
            },
            Fun: {
                name: 'Fun',
                allocated: 50,
                spent: 0, // T19 is disposable (R-BUCKET-1)
                remaining: 50,
                percentageUsed: 0,
                status: 'under',
                previousMonthSpent: 0,
                averageSpent: 0,
            },
        },
        bills: { predicted: 240, actual: 210, variance: -30 },
        // Same bucket analyze uses
        unbudgetedExpenses: {
            total: 436,
            transactions: ['T09', 'T16', 'T17', 'T26', 'T29', 'T30', 'T31', 'T33'],
        },
    },

    '2025-02': {
        schemaVersion: 2,
        month: 2,
        year: 2025,
        currencySymbol: '$',
        totals: { spent: 100, allocated: 400, percentageUsed: 25 },
        budgets: {
            Groceries: {
                name: 'Groceries',
                allocated: 400,
                spent: 100, // F4
                remaining: 300,
                percentageUsed: 25,
                status: 'under',
                previousMonthSpent: 220, // January Groceries
                averageSpent: 160, // (100 + 220) / 2
            },
            Dining: {
                name: 'Dining',
                allocated: 0, // no February limit
                spent: 0,
                remaining: 0,
                percentageUsed: 0, // no limit -> 0 by definition
                status: 'under',
                previousMonthSpent: 45, // January Dining, T25 excluded
                averageSpent: 22.5, // (0 + 45) / 2
            },
            Utilities: {
                name: 'Utilities',
                allocated: 0,
                spent: 0,
                remaining: 0,
                percentageUsed: 0,
                status: 'under',
                previousMonthSpent: 0, // January Utilities: T22 is a bill
                averageSpent: 0,
            },
            Fun: {
                name: 'Fun',
                allocated: 0,
                spent: 0,
                remaining: 0,
                percentageUsed: 0,
                status: 'under',
                previousMonthSpent: 0, // January Fun: T19 is disposable
                averageSpent: 0,
            },
        },
        bills: { predicted: 240, actual: 0, variance: -240 },
        unbudgetedExpenses: { total: 0, transactions: [] },
    },

    '2025-03': {
        schemaVersion: 2,
        month: 3,
        year: 2025,
        currencySymbol: '$',
        totals: { spent: 60, allocated: 400, percentageUsed: 15 },
        budgets: {
            Groceries: {
                name: 'Groceries',
                allocated: 400,
                spent: 60, // M3; M2 comes from SAV, outside (R-SCOPE-2)
                remaining: 340,
                percentageUsed: 15,
                status: 'under',
                previousMonthSpent: 100, // February Groceries
                averageSpent: 80, // (60 + 100) / 2
            },
            Dining: {
                name: 'Dining',
                allocated: 0,
                spent: 0,
                remaining: 0,
                percentageUsed: 0,
                status: 'under',
                previousMonthSpent: 0,
                averageSpent: 0,
            },
            Utilities: {
                name: 'Utilities',
                allocated: 0,
                spent: 0,
                remaining: 0,
                percentageUsed: 0,
                status: 'under',
                previousMonthSpent: 0,
                averageSpent: 0,
            },
            Fun: {
                name: 'Fun',
                allocated: 0,
                spent: 0,
                remaining: 0,
                percentageUsed: 0,
                status: 'under',
                previousMonthSpent: 0,
                averageSpent: 0,
            },
        },
        bills: { predicted: 240, actual: 0, variance: -240 },
        unbudgetedExpenses: { total: 0, transactions: [] },
    },
};

// Compared after stripAnsi, with each output line trimmed and runs of
// whitespace collapsed to one space (see parse/text-output.ts). `section` is
// the title of the ┌─┐ section header the line sits under, or PREAMBLE for
// anything before the first one.

export const PREAMBLE = '(preamble)';

export interface TextLineExpectation {
    section: string;
    line: string;
}

export interface TextExpectation {
    lines: TextLineExpectation[];
    /** Section titles that must not appear at all */
    absentSections: string[];
    /** Substrings that must appear nowhere in the output */
    absentText: string[];
}

const INC = 'INCOME SOURCES';
const EXP = 'EXPENSES & SPENDING';
const PAY = 'PAYCHECK ANALYSIS';
const SUM = 'FINANCIAL SUMMARY';
const REC = 'RECOMMENDATIONS';

export const ANALYZE_TEXT: Record<AssertedMonthId, TextExpectation> = {
    '2025-01': {
        lines: [
            { section: PREAMBLE, line: '║ Budget Finalization Report + January 2025 ║' },
            { section: INC, line: 'Additional Income $465.00 ✓ [3 transactions]' },
            { section: EXP, line: 'Unbudgeted Expenses -$436.00 ⚠ [8 transactions]' },
            { section: EXP, line: 'Allocated: $700.00' },
            { section: EXP, line: 'Spent: $265.00' },
            { section: EXP, line: 'Remaining: +$435.00 ✓' },
            { section: EXP, line: 'Predicted: $240.00' },
            { section: EXP, line: 'Actual: $210.00' },
            { section: EXP, line: 'Variance: -$30.00 ✓' },
            { section: EXP, line: 'Disposable Income $80.00 [3 transactions]' },
            { section: EXP, line: 'reimbursed from the disposable pool — not in the net' },
            { section: PAY, line: 'Expected: $2100.00' },
            { section: PAY, line: 'Actual: $2000.00' },
            { section: PAY, line: 'Variance: -$100.00 ⚠' },
            { section: SUM, line: '✓ Additional Income: +$465.00' },
            { section: SUM, line: '✓ Paycheck: +$2000.00' },
            { section: SUM, line: '⚠ Bills Paid: -$210.00' },
            { section: SUM, line: '⚠ Budget Spent: -$265.00' },
            { section: SUM, line: '⚠ Unbudgeted Expenses: -$436.00' },
            // No thousands separator
            { section: SUM, line: 'Net Cash Flow: +$1554.00 ✓' },
            { section: SUM, line: '→ Transfer from disposable pool: $80.00 [3 transactions]' },
            { section: SUM, line: 'Not included in the net — covers tagged card purchases.' },
            { section: REC, line: '✓ Strong Position: Maintain current approach' },
        ],
        absentSections: [],
        absentText: ['Return to disposable pool', 'Budget Rollup', 'charged to another section'],
    },
    '2025-02': {
        lines: [
            { section: PREAMBLE, line: '║ Budget Finalization Report + February 2025 ║' },
            { section: INC, line: 'Additional Income $0.00 ○ [0 transactions]' },
            { section: EXP, line: 'Unbudgeted Expenses $0.00 ○ [0 transactions]' },
            { section: EXP, line: 'Allocated: $400.00' },
            { section: EXP, line: 'Spent: $100.00' },
            { section: EXP, line: 'Remaining: +$300.00 ✓' },
            { section: EXP, line: 'Predicted: $240.00' },
            { section: EXP, line: 'Actual: $0.00' },
            { section: EXP, line: 'Variance: -$240.00 ✓' },
            { section: EXP, line: 'Disposable Income $20.00 [2 transactions]' },
            {
                section: EXP,
                line: 'refunds exceeded tagged spending — owed back to the pool, not in the net',
            },
            { section: PAY, line: 'Actual: $1000.00' },
            { section: PAY, line: 'Variance: -$1100.00 ⚠' },
            { section: SUM, line: '○ Additional Income: $0.00' },
            { section: SUM, line: '✓ Paycheck: +$1000.00' },
            { section: SUM, line: '○ Bills Paid: $0.00' },
            { section: SUM, line: '⚠ Budget Spent: -$100.00' },
            { section: SUM, line: '○ Unbudgeted Expenses: $0.00' },
            { section: SUM, line: 'Net Cash Flow: +$900.00 ✓' },
            { section: SUM, line: '← Return to disposable pool: $20.00 [2 transactions]' },
            {
                section: SUM,
                line: 'Not included in the net — tagged refunds exceeded tagged spending.',
            },
        ],
        absentSections: [],
        absentText: [
            'Budget Rollup',
            'charged to another section',
            'Transfer from disposable pool',
        ],
    },
    '2025-03': {
        lines: [
            { section: PREAMBLE, line: '║ Budget Finalization Report + March 2025 ║' },
            { section: INC, line: 'Additional Income $0.00 ○ [0 transactions]' },
            { section: EXP, line: 'Unbudgeted Expenses $0.00 ○ [0 transactions]' },
            { section: EXP, line: 'Allocated: $400.00' },
            { section: EXP, line: 'Spent: $60.00' },
            { section: EXP, line: 'Remaining: +$340.00 ✓' },
            { section: EXP, line: 'Variance: -$240.00 ✓' },
            { section: PAY, line: 'Actual: $1000.00' },
            { section: SUM, line: '○ Additional Income: $0.00' },
            { section: SUM, line: '⚠ Budget Spent: -$60.00' },
            { section: SUM, line: 'Net Cash Flow: +$940.00 ✓' },
        ],
        absentSections: [],
        // Nothing tagged is in the envelope, so there is no pool action
        absentText: [
            'Budget Rollup',
            'charged to another section',
            'Transfer from disposable pool',
            'Return to disposable pool',
        ],
    },
};

const ON_TRACK = 'ON TRACK';
const BILLS = 'BILLS & RECURRING';
const UNBUDGETED = 'UNBUDGETED EXPENSES';
/** Removed from the report; must never come back */
const UNTRACKED = 'UNTRACKED SPENDING';

// Progress bar: round(pct / 100 * 20) filled cells out of 20.
// prettier-ignore
export const REPORT_TEXT: Record<AssertedMonthId, TextExpectation> = {
    '2025-01': {
        lines: [
            { section: PREAMBLE, line: '║ BUDGET REPORT - JANUARY 2025 ║' },
            { section: PREAMBLE, line: 'Total Spent: $265.00 / $700.00' },
            { section: PREAMBLE, line: 'Status: 🟢 ON TRACK (37.9% spent)' },
            // 55% -> 11 filled
            { section: ON_TRACK, line: '🟢 Groceries $220.00 / $400.00 55% [▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░] $180.00 left' },
            // 30% -> 6 filled
            { section: ON_TRACK, line: '🟢 Dining $45.00 / $150.00 30% [▓▓▓▓▓▓░░░░░░░░░░░░░░] $105.00 left' },
            // Under the prediction overall -> 🟢
            { section: BILLS, line: 'Expected: $240.00 Actual: $210.00 🟢 -$30.00' },
            // +10 on 100 is 10%, not above the 10% warning threshold -> 🟢
            { section: BILLS, line: '🟢 Electric $110.00 (expected $100.00)' },
            { section: BILLS, line: '🟢 Internet $60.00 (expected $60.00)' },
            // predicted 0 with positive spend -> 🔴
            { section: BILLS, line: '🔴 Old Gym $40.00 (expected $0.00)' },
            // Paid from the pool, which is outside (R-SCOPE-2): nothing counts
            { section: BILLS, line: '🟢 Insurance $0.00 (expected $80.00)' },
            { section: UNBUDGETED, line: 'Total: $436.00' },
        ],
        absentSections: ['ATTENTION NEEDED', UNTRACKED],
        absentText: [],
    },
    '2025-02': {
        lines: [
            { section: PREAMBLE, line: '║ BUDGET REPORT - FEBRUARY 2025 ║' },
            { section: PREAMBLE, line: 'Total Spent: $100.00 / $400.00' },
            { section: PREAMBLE, line: 'Status: 🟢 ON TRACK (25.0% spent)' },
            // 25% -> 5 filled
            { section: ON_TRACK, line: '🟢 Groceries $100.00 / $400.00 25% [▓▓▓▓▓░░░░░░░░░░░░░░░] $300.00 left' },
            { section: BILLS, line: 'Expected: $240.00 Actual: $0.00 🟢 -$240.00' },
            { section: BILLS, line: '🟢 Electric $0.00 (expected $100.00)' },
        ],
        absentSections: ['ATTENTION NEEDED', UNBUDGETED, UNTRACKED],
        absentText: ['Old Gym'],
    },
    '2025-03': {
        lines: [
            { section: PREAMBLE, line: '║ BUDGET REPORT - MARCH 2025 ║' },
            { section: PREAMBLE, line: 'Total Spent: $60.00 / $400.00' },
            { section: PREAMBLE, line: 'Status: 🟢 ON TRACK (15.0% spent)' },
            // 15% -> 3 filled
            { section: ON_TRACK, line: '🟢 Groceries $60.00 / $400.00 15% [▓▓▓░░░░░░░░░░░░░░░░░] $340.00 left' },
            { section: BILLS, line: 'Expected: $240.00 Actual: $0.00 🟢 -$240.00' },
        ],
        absentSections: ['ATTENTION NEEDED', UNBUDGETED, UNTRACKED],
        absentText: [],
    },
};

// A field where the code disagrees with RULES.md. Its test asserts the RULES
// value and runs as `test.failing` until the code is fixed. Empty means the
// code implements RULES.md everywhere the scenario can see.

export interface KnownDefect {
    /** KD-n, numbered in the order found */
    id: string;
    month: AssertedMonthId;
    command: 'analyze' | 'report';
    /**
     * JSON: dotted path into the Expected* shape (e.g. `budgets.Dining.spent`,
     * `additionalIncome.transactions`). Text: `text:<section>|<line>`.
     */
    fieldPath: string;
    /** The RULES.md value (identical to the literal at fieldPath above) */
    expected: unknown;
    /** What the code produces today, for the record; never asserted */
    codeToday: unknown;
    /** The rule the code violates */
    doc: string;
}

export const textPath = (section: string, line: string): string => `text:${section}|${line}`;

export const KNOWN_DEFECTS: KnownDefect[] = [];

export function findKnownDefect(
    command: KnownDefect['command'],
    month: AssertedMonthId,
    fieldPath: string
): KnownDefect | undefined {
    return KNOWN_DEFECTS.find(
        d => d.command === command && d.month === month && d.fieldPath === fieldPath
    );
}
