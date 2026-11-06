export interface TopExpenseDto {
    description: string;
    /** Absolute value */
    amount: number;
    budgetName: string;
    /** YYYY-MM-DD */
    date: string;
    /** Journal id */
    transactionId: string;
    currencySymbol: string;
}
