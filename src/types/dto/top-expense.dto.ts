/**
 * DTO for representing a top expense/transaction
 * Used to display the highest spending transactions in the report
 */
export interface TopExpenseDto {
    /**
     * Transaction description (merchant name, store, etc.)
     */
    description: string;

    /**
     * Transaction amount (absolute value)
     */
    amount: number;

    /**
     * Name of the budget this transaction belongs to
     */
    budgetName: string;

    /**
     * Transaction date in ISO format (YYYY-MM-DD)
     */
    date: string;

    /**
     * Firefly III transaction journal ID for linking
     */
    transactionId: string;

    /**
     * Currency symbol (e.g., "$", "€", "£")
     */
    currencySymbol: string;
}
