export interface HistoricalComparisonDto {
    previousMonthSpent: number;
    threeMonthAvg: number;
}

export interface TransactionStats {
    count: number;
    average: number;
    topMerchant?: MerchantInsight;
    spendingTrend?: SpendingTrend;
}

export interface MerchantInsight {
    name: string;
    visitCount: number;
    totalSpent: number;
}

export interface SpendingTrend {
    direction: 'increasing' | 'decreasing' | 'stable';
    difference: number;
    percentageChange: number;
}

export interface BudgetReportDto {
    budgetId: string;
    name: string;
    amount: number;
    spent: number;
    historicalComparison?: HistoricalComparisonDto;
    transactionStats?: TransactionStats;
}
