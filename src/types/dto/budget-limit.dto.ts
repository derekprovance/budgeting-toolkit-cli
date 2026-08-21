export interface HistoricalComparisonDto {
    previousMonthSpent: number;
    /** Mean spend across the current month plus the fetched history (up to 3) */
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
    spent: number;
    historicalComparison?: HistoricalComparisonDto;
    transactionStats?: TransactionStats;
}
