"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockBudgets =
    exports.mockCategories =
    exports.mockTransactions =
    exports.createMockTransaction =
        void 0;
const createMockTransaction = (overrides = {}) => ({
    transaction_journal_id: "1",
    description: "Walmart Supercenter",
    amount: "150.00",
    type: "withdrawal",
    date: new Date().toISOString(),
    source_id: "source1",
    destination_id: "dest1",
    currency_code: "USD",
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
    bunq_payment_id: null,
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
});
exports.createMockTransaction = createMockTransaction;
exports.mockTransactions = {
    walmart: (0, exports.createMockTransaction)({
        transaction_journal_id: "1",
        description: "Walmart Supercenter",
        amount: "150.00",
    }),
    pharmacy: (0, exports.createMockTransaction)({
        transaction_journal_id: "2",
        description: "Walmart Pharmacy",
        amount: "25.00",
    }),
    amazon: (0, exports.createMockTransaction)({
        transaction_journal_id: "3",
        description: "Amazon Fresh",
        amount: "75.00",
    }),
};
exports.mockCategories = {
    groceries: "Groceries",
    healthcare: "Healthcare",
    shopping: "Shopping",
    other: "Other",
};
exports.mockBudgets = {
    food: "Food",
    medical: "Medical",
    shopping: "Shopping",
    other: "Other",
};
