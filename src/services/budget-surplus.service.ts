import { BudgetService } from './core/budget.service.js';
import { DateUtils } from '../utils/date.utils.js';
import { logger } from '../logger.js';
import { Result } from '../types/result.type.js';
import { BudgetError, BudgetErrorFactory, BudgetErrorType } from '../types/error/budget.error.js';

/**
 * Result interface for budget surplus calculation
 */
export interface BudgetSurplusResult {
    totalAllocated: number;
    totalSpent: number;
    surplus: number;
}

/**
 * Service for calculating budget surplus or deficit.
 *
 * Calculates the difference between allocated budget and actual spending for a given month.
 * - Positive value = surplus (under budget)
 * - Negative value = deficit (over budget)
 */
export class BudgetSurplusService {
    constructor(private readonly budgetService: BudgetService) {}

    /**
     * Calculates budget surplus or deficit for a given month and year.
     * Returns Result type for explicit error handling.
     *
     * @param month - The month to calculate for (1-12)
     * @param year - The year to calculate for
     * @returns Result containing budget details (allocated, spent, surplus)
     */
    async calculateBudgetSurplus(
        month: number,
        year: number
    ): Promise<Result<BudgetSurplusResult, BudgetError>> {
        const operation = 'calculateBudgetSurplus';

        // Validate date
        try {
            DateUtils.validateMonthYear(month, year);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.warn({ month, year, operation, error: err.message }, 'Invalid date parameters');

            return Result.err(
                BudgetErrorFactory.create(BudgetErrorType.INVALID_DATE, month, year, operation, err)
            );
        }

        logger.debug({ month, year }, 'Calculating budget surplus');

        try {
            // Fetch budget limits and insights in parallel
            const [budgetLimits, insights] = await Promise.all([
                this.budgetService.getBudgetLimits(month, year),
                this.budgetService.getBudgetExpenseInsights(month, year),
            ]);

            // Calculate total allocated amount
            const totalAllocated = budgetLimits.reduce((sum, limit) => {
                const amount = Number(limit.attributes.amount);
                return sum + (isNaN(amount) ? 0 : amount);
            }, 0);

            // Calculate total spent amount
            const totalSpent = insights.reduce((sum, insight) => {
                const spent = insight.difference_float ?? 0;
                return sum + Math.abs(spent);
            }, 0);

            // Calculate surplus (positive) or deficit (negative)
            const surplus = totalAllocated - totalSpent;

            logger.debug(
                {
                    month,
                    year,
                    totalAllocated,
                    totalSpent,
                    surplus,
                    budgetCount: budgetLimits.length,
                },
                'Budget surplus calculated successfully'
            );

            return Result.ok({
                totalAllocated,
                totalSpent,
                surplus,
            });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));

            logger.error(
                {
                    month,
                    year,
                    operation,
                    error: err.message,
                    stack: err.stack,
                },
                'Failed to calculate budget surplus'
            );

            return Result.err(
                BudgetErrorFactory.create(
                    BudgetErrorType.CALCULATION_FAILED,
                    month,
                    year,
                    operation,
                    err
                )
            );
        }
    }
}
