import { BudgetLimitDto, HistoricalComparisonDto, TransactionStats } from './budget-limit.dto.js';

/**
 * Budget report DTO with calculated fields for display
 * Extends the base BudgetLimitDto with status, percentage, and remaining amount
 */
export interface BudgetReportDto extends BudgetLimitDto {
    /**
     * Budget status based on spending
     * - 'over': spent amount exceeds budget limit
     * - 'on-track': spent amount between 85-100% of budget
     * - 'under': spent amount below 85% of budget
     */
    status: 'over' | 'on-track' | 'under';

    /**
     * Percentage of budget that has been spent (0-100+)
     * Calculated as: (spent / amount) * 100. Negative when a budget's refunds
     * exceeded its outflows — deliberately not floored, and never Math.abs()'d.
     */
    percentageUsed: number;

    /**
     * Amount remaining in budget (negative if over budget)
     * Calculated as: amount - spent (spent is positive-for-spending)
     */
    remaining: number;

    /**
     * Historical comparison data (required, unlike optional in BudgetLimitDto)
     */
    historicalComparison: HistoricalComparisonDto;

    /**
     * Transaction statistics (required, unlike optional in BudgetLimitDto)
     */
    transactionStats: TransactionStats;
}
