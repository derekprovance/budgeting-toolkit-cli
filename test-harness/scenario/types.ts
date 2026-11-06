/**
 * Types for the shared e2e / in-process scenario.
 *
 * Everything here is declarative and keyed by scenario keys (CHK, T01, …),
 * never by Firefly ids. A seeder turns the keys into ids and records them in
 * an {@link IdMap}; suites map ids in CLI output back to keys through it.
 *
 * This directory must not import from src/ (enforced by ESLint): expected
 * values are hand-derived from the documented domain model, so they cannot be
 * allowed to reuse the logic under test.
 */

export type AccountKey = 'CHK' | 'CC' | 'SAV' | 'BRK' | 'POOL' | 'OLD';
export type BillKey = 'B_ELEC' | 'B_NET' | 'B_GYM' | 'B_INS';
export type BudgetKey = 'Groceries' | 'Dining' | 'Utilities' | 'Fun';

/** 2025-01, the main month */
// prettier-ignore
export type JanKey =
    | 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06' | 'T07' | 'T08' | 'T09' | 'T10'
    | 'T11' | 'T12' | 'T13' | 'T14' | 'T15' | 'T16' | 'T17' | 'T18' | 'T19' | 'T20'
    | 'T21' | 'T22' | 'T23' | 'T24' | 'T25' | 'T26' | 'T27' | 'T28' | 'T29' | 'T30'
    | 'T31' | 'T32' | 'T33';
export type DecKey = 'D1' | 'D2' | 'D3';
export type FebKey = 'F1' | 'F2' | 'F3' | 'F4';
export type MarKey = 'M1' | 'M2' | 'M3' | 'M4' | 'M5';
export type TxKey = JanKey | DecKey | FebKey | MarKey;

/** Months the scenario seeds, as YYYY-MM */
export type MonthId = '2024-12' | '2025-01' | '2025-02' | '2025-03';

/** Months the analyze/report suites assert */
export type AssertedMonthId = Exclude<MonthId, '2024-12'>;

export type AccountRole = 'defaultAsset' | 'ccAsset' | 'savingAsset';
export type TransactionType = 'withdrawal' | 'deposit' | 'transfer';

export interface AssetAccountDef {
    key: AccountKey;
    name: string;
    /** Firefly account type; the scenario only declares asset accounts */
    type: 'asset';
    accountRole: AccountRole;
    currencyCode: 'USD';
    /** Only for ccAsset; required on create, reads back as null (V6) */
    creditCardType?: 'monthlyFull';
    /** Only for ccAsset, YYYY-MM-DD; required on create, reads back as null (V6) */
    monthlyPaymentDate?: string;
    /** No opening balances anywhere in the scenario */
    openingBalance: null;
    /** Set `active: false` after every transaction has been stored */
    deactivateAfterSeed: boolean;
}

export interface BillDef {
    key: BillKey;
    name: string;
    /** min === max for every scenario bill */
    amountMin: number;
    amountMax: number;
    /** Start date, YYYY-MM-DD; its day-of-month is the due day */
    date: string;
    repeatFreq: 'monthly';
    currencyCode: 'USD';
    /** Set `active: false` after its transactions have been stored */
    deactivateAfterSeed: boolean;
}

export interface BudgetLimitDef {
    /** YYYY-MM; the limit spans the whole calendar month */
    month: MonthId;
    amount: number;
}

export interface BudgetDef {
    key: BudgetKey;
    name: string;
    limits: BudgetLimitDef[];
}

/**
 * One end of a transaction.
 * - `{ asset }` is a scenario asset account.
 * - `{ name }` is an expense or revenue account Firefly creates implicitly.
 *
 * There is no "no source" form: Firefly 6.6.6 attaches a source-less deposit
 * to "Cash account", while real payroll comes from a revenue account named
 * "(no name)" — so the ledger names it explicitly (V12).
 */
export type Endpoint = { asset: AccountKey } | { name: string };

export interface TransactionDef {
    key: TxKey;
    /** YYYY-MM-DD, interpreted in UTC */
    date: string;
    type: TransactionType;
    /** Unsigned, as Firefly stores it; direction comes from `type` */
    amount: number;
    description: string;
    source: Endpoint;
    destination: Endpoint;
    /** Withdrawals only: Firefly silently drops a budget on anything else (V8) */
    budget?: BudgetKey;
    bill?: BillKey;
    tags: string[];
    /** Free-text reason the transaction exists in the scenario */
    note: string;
}

export interface ScenarioLedger {
    accounts: AssetAccountDef[];
    bills: BillDef[];
    budgets: BudgetDef[];
    /** Tags the seeder must create before storing transactions */
    tags: string[];
    transactions: TransactionDef[];
}

/**
 * What the seeder returns: every scenario key mapped to the id Firefly gave it.
 * The same shape is written to `.e2e/id-map.json`.
 */
export interface IdMap {
    accounts: Record<AccountKey, string>;
    bills: Record<BillKey, string>;
    budgets: Record<BudgetKey, string>;
    transactions: Record<TxKey, { groupId: string; journalId: string }>;
}
