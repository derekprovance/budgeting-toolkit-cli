import { BudgetRead, TransactionRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';

/** Fixed date for builder-made transactions, inside the 2025-01 test month. */
export const TEST_DATE = '2025-01-15';

/**
 * Typed transaction builders.
 *
 * They encode Firefly's actual wire format (verified against 6.6.6): `amount`
 * is always UNSIGNED, and direction lives only in `type`. Pass the amount as a
 * non-negative number or string; a signed value is a test bug and throws, so a
 * fixture can never smuggle direction through the sign.
 *
 * Every builder uses the fixed date TEST_DATE unless overridden.
 */
type BuilderOverrides = Partial<Omit<TransactionSplit, 'type' | 'amount'>>;

const unsignedAmount = (amount: number | string): string => {
    // Garbage strings pass through untouched, so tests can still feed the
    // parser malformed input; only a sign is refused.
    const value = typeof amount === 'number' ? amount : parseFloat(amount);
    if (value < 0 || (typeof amount === 'string' && amount.trim().startsWith('-'))) {
        throw new Error(
            `Test builder amount must be unsigned (Firefly direction lives in "type"); got ${amount}`
        );
    }
    return typeof amount === 'number' ? amount.toFixed(2) : amount;
};

const build = (
    type: 'withdrawal' | 'deposit' | 'transfer',
    amount: number | string,
    overrides: BuilderOverrides
): TransactionSplit => ({
    transaction_journal_id: '1',
    description: 'Walmart Supercenter',
    date: TEST_DATE,
    source_id: 'source1',
    destination_id: 'dest1',
    currency_code: 'USD',
    foreign_amount: null,
    foreign_currency_code: null,
    budget_id: null,
    category_name: null,
    notes: null,
    external_id: null,
    order: null,
    tags: [],
    reconciled: false,
    bill_id: null,
    internal_reference: null,
    external_url: null,
    sepa_ct_id: null,
    sepa_ct_op: null,
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
    ...overrides,
    type,
    amount: unsignedAmount(amount),
});

/** Money leaving a tracked asset account for an expense account. */
export const withdrawal = (amount: number | string, overrides: BuilderOverrides = {}) =>
    build('withdrawal', amount, overrides);

/** Money arriving in an asset account from a revenue account. */
export const deposit = (amount: number | string, overrides: BuilderOverrides = {}) =>
    build('deposit', amount, overrides);

/** Money moving between two asset accounts. */
export const transfer = (amount: number | string, overrides: BuilderOverrides = {}) =>
    build('transfer', amount, overrides);

/** A Firefly budget, with only the fields the code under test reads. */
export const budgetRead = (id: string, name: string, active = true): BudgetRead =>
    ({ id, type: 'budgets', attributes: { name, active } }) as BudgetRead;

/** A Firefly transaction group holding `splits`, with only the fields the code under test reads. */
export const transactionRead = (id: string, ...splits: TransactionSplit[]): TransactionRead =>
    ({ type: 'transactions', id, attributes: { transactions: splits } }) as TransactionRead;
