export interface HistoricalComparisonDto {
    previousMonthSpent: number;
    /** Mean spend over the current month and each history month the budget appears in */
    averageSpent: number;
}

export interface TransactionStats {
    count: number;
    average: number;
    topMerchant?: MerchantInsight;
}

export interface MerchantInsight {
    name: string;
    visitCount: number;
    totalSpent: number;
}

export interface BudgetLimitDto {
    budgetId: string;
    name: string;
    amount: number;
    /**
     * Net spend of this budget's share of the month's budget bucket
     * (R-BUDGET-1): positive for spending, negative when its refunds exceed
     * its outflows, so it must not be Math.abs()'d.
     */
    spent: number;
}
