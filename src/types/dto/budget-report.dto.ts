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
     * Calculated as: (Math.abs(spent) / amount) * 100
     */
    percentageUsed: number;

    /**
     * Amount remaining in budget (can be negative if over budget)
     * Calculated as: amount + spent (since spent is typically negative)
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
