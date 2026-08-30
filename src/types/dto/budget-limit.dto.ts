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
    /**
     * Amount spent, POSITIVE for spending — negated from Firefly's
     * `difference_float` once in BudgetReportService. A budget whose refunds
     * exceed its outflows is therefore negative, and must not be Math.abs()'d.
     */
    spent: number;
    historicalComparison?: HistoricalComparisonDto;
    transactionStats?: TransactionStats;
}
