/**
 * Literals describing Firefly III's OWN server behavior for the seeded
 * scenario. The fake server (test-harness/fake-firefly) models exactly these;
 * the contract suite runs the same assertions against real Firefly in e2e.
 * If the two disagree, this file is corrected — it is the only place observed
 * server behavior is recorded.
 *
 * Vn references point at the evidence in test-harness/VERIFICATION.md
 * (Firefly III 6.6.6).
 */
import type { AccountKey, BillKey, MonthId, TxKey } from './types.js';

/** Month bounds as the CLI sends them; both ends are inclusive (V16, verified) */
export const MONTH_RANGES: Record<MonthId, { start: string; end: string }> = {
    '2024-12': { start: '2024-12-01', end: '2024-12-31' },
    '2025-01': { start: '2025-01-01', end: '2025-01-31' },
    '2025-02': { start: '2025-02-01', end: '2025-02-28' },
    '2025-03': { start: '2025-03-01', end: '2025-03-31' },
};

/** Page size the e2e run uses (BTK_PAGE_SIZE=10) */
export const CONTRACT_PAGE_LIMIT = 10;

/**
 * V14 (verified): per_page defaults to 50 when `limit` is omitted, and there
 * is NO server-side cap — limit=1000 is served as per_page 1000. The fake
 * server must not cap either.
 */
export const PAGINATION_BEHAVIOR = { defaultLimit: 50, serverCap: null } as const;

/** A limit larger than any plausible cap, to prove there is none */
export const UNCAPPED_PROBE_LIMIT = 1000;

/**
 * GET /v1/transactions?start&end&limit=10 — meta.pagination for each month.
 * One group per scenario transaction. V14 (verified): `limit` is honored with
 * a correct total_pages.
 */
export const TRANSACTION_PAGINATION: Record<MonthId, { total: number; totalPages: number }> = {
    '2024-12': { total: 3, totalPages: 1 },
    '2025-01': { total: 33, totalPages: 4 }, // ceil(33 / 10)
    '2025-02': { total: 4, totalPages: 1 },
    '2025-03': { total: 5, totalPages: 1 },
};

/** Transaction groups per month (V16: the 31st belongs to its own month) */
export const TRANSACTIONS_BY_MONTH: Record<MonthId, TxKey[]> = {
    '2024-12': ['D1', 'D2', 'D3'],
    // prettier-ignore
    '2025-01': [
        'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11',
        'T12', 'T13', 'T14', 'T15', 'T16', 'T17', 'T18', 'T19', 'T20', 'T21', 'T22',
        'T23', 'T24', 'T25', 'T26', 'T27', 'T28', 'T29', 'T30', 'T31', 'T32', 'T33',
    ],
    '2025-02': ['F1', 'F2', 'F3', 'F4'],
    '2025-03': ['M1', 'M2', 'M3', 'M4', 'M5'],
};

/**
 * GET /v1/bills?start&end — `pay_dates` (date part, YYYY-MM-DD) per bill.
 * Monthly bills fall due on their start date's day of month.
 *
 * V11 (verified):
 * - every monthly bill has non-empty pay_dates in a ranged query, INACTIVE
 *   bills included;
 * - a bill already PAID within the window reports its NEXT occurrence instead
 *   (outside the window; still one date);
 * - amount_avg is present and equals (min + max) / 2;
 * - without start/end, pay_dates is [].
 *
 * So in January, when all four bills are paid (T21–T24), every pay date is in
 * February. BillComparisonService then predicts via its "transactions but no
 * pay date in month" fallback for bills it counted, and 0 for inactive Old Gym.
 * Insurance (T24) is paid from the pool, which is outside the envelope, so it
 * is counted nowhere and has no row in January.
 */
export const BILL_PAY_DATES: Record<MonthId, Record<BillKey, string[]>> = {
    '2024-12': {
        B_ELEC: ['2024-12-10'],
        B_NET: ['2024-12-12'],
        B_GYM: ['2024-12-05'],
        B_INS: ['2024-12-06'],
    },
    // All paid in January -> next occurrence
    '2025-01': {
        B_ELEC: ['2025-02-10'], // paid by T21
        B_NET: ['2025-02-12'], // paid by T22
        B_GYM: ['2025-02-05'], // paid by T23 (inactive, still reported)
        B_INS: ['2025-02-06'], // paid by T24
    },
    '2025-02': {
        B_ELEC: ['2025-02-10'],
        B_NET: ['2025-02-12'],
        B_GYM: ['2025-02-05'], // inactive, still reported
        B_INS: ['2025-02-06'],
    },
    '2025-03': {
        B_ELEC: ['2025-03-10'],
        B_NET: ['2025-03-12'],
        B_GYM: ['2025-03-05'], // inactive, still reported
        B_INS: ['2025-03-06'],
    },
};

/** V11: `amount_avg` per bill, as a number */
export const BILL_AMOUNT_AVG: Record<BillKey, number> = {
    B_ELEC: 100,
    B_NET: 60,
    B_GYM: 40,
    B_INS: 80,
};

/** Bills whose `active` is false after seeding (V11: still listed, verified) */
export const INACTIVE_BILLS: BillKey[] = ['B_GYM'];

/**
 * GET /v1/accounts?type=asset — inactive accounts are still listed, with
 * `active: false` (V15, verified; `active=true` is not a filter).
 */
export const ASSET_ACCOUNTS_ACTIVE: Record<AccountKey, boolean> = {
    CHK: true,
    CC: true,
    SAV: true,
    BRK: true,
    POOL: true,
    OLD: false,
};

/**
 * Payroll deposits name their source "(no name)" explicitly, which creates or
 * reuses a Revenue account of that name — what real data looks like. (A
 * deposit stored with NO source would land on "Cash account" instead: V12.)
 */
export const NO_NAME_REVENUE = {
    sourceName: '(no name)',
    sourceType: 'Revenue account',
    /** Scenario deposits whose ledger source is { name: '(no name)' } */
    transactions: ['D2', 'T01', 'T02', 'T03', 'T04', 'F1', 'M1'] as TxKey[],
};

/**
 * GET /v1/currencies/primary after seeding. V13 (verified): a fresh install is
 * EUR; the seeder must POST /v1/currencies/USD/primary with body {} (no body
 * is a 415), which also enables USD.
 */
export const PRIMARY_CURRENCY = { code: 'USD', symbol: '$' };

/**
 * V6 (verified): a ccAsset needs credit_card_type and monthly_payment_date on
 * create (422 otherwise), but both read back as null. The seeder's read-back
 * must expect these values, not the ones it sent.
 */
export const CC_READBACK = {
    accountRole: 'ccAsset',
    creditCardType: null,
    monthlyPaymentDate: null,
};

/**
 * V8 (verified): budget_id on a deposit or transfer is silently dropped (200,
 * null on read-back). The ledger therefore budgets withdrawals only.
 */
export const BUDGET_ONLY_ON_WITHDRAWALS = true;

/**
 * V23 (verified): GET /v1/tags/{tag} for a tag that does not exist answers
 * 404. `tagExists` relies on it: only this status means "no such tag".
 */
export const UNKNOWN_TAG = { tag: 'btk-contract-no-such-tag', status: 404 } as const;

/**
 * Wire formats (verified): amounts are unsigned strings with 12 decimals
 * ("1000.000000000000"); dates look like "2025-01-01T00:00:00+00:00"; group
 * ids and journal ids are distinct sequences.
 */
export const WIRE_FORMAT = {
    amountPattern: /^\d+\.\d{12}$/,
    datePattern: /^\d{4}-\d{2}-\d{2}T00:00:00\+00:00$/,
};
