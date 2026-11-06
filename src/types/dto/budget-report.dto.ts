import { BudgetLimitDto, HistoricalComparisonDto, TransactionStats } from './budget-limit.dto.js';

/**
 * - `over`: a budget with a limit spent more than it
 * - `on-track`: spent at least `BUSINESS_CONSTANTS.BUDGET.ON_TRACK_THRESHOLD`
 *   percent of its limit without exceeding it
 * - `under`: everything else, including a budget with no limit
 */
export type BudgetStatus = 'over' | 'on-track' | 'under';

/**
 * Budget report DTO with calculated fields for display
 * Extends the base BudgetLimitDto with status, percentage, and remaining amount
 */
export interface BudgetReportDto extends BudgetLimitDto {
    status: BudgetStatus;

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

    historicalComparison: HistoricalComparisonDto;

    transactionStats: TransactionStats;
}
