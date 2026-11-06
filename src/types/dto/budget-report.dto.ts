import { BudgetLimitDto, HistoricalComparisonDto, TransactionStats } from './budget-limit.dto.js';

/**
 * - `over`: a budget with a limit spent more than it
 * - `on-track`: spent at least `BUSINESS_CONSTANTS.BUDGET.ON_TRACK_THRESHOLD`
 *   percent of its limit without exceeding it
 * - `under`: everything else, including a budget with no limit
 */
export type BudgetStatus = 'over' | 'on-track' | 'under';

export interface BudgetReportDto extends BudgetLimitDto {
    status: BudgetStatus;

    /** Negative when refunds exceeded outflows: deliberately not floored or Math.abs()'d. */
    percentageUsed: number;

    /** Negative when over budget */
    remaining: number;

    historicalComparison: HistoricalComparisonDto;

    transactionStats: TransactionStats;
}
