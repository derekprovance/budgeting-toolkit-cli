import { BudgetLimitDto } from '../types/dto/budget-limit.dto.js';
import { IBudgetService } from './core/budget.service.interface.js';
import { allocationsByBudget } from './core/budget.service.js';
import { BudgetReportService as IBudgetReportService } from '../types/interface/budget-report.service.interface.js';
import { CashFlowService } from './cash-flow.service.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { logger } from '../logger.js';
import { Result } from '../types/result.type.js';
import { BudgetError, BudgetErrorFactory, BudgetErrorType } from '../types/error/budget.error.js';

export class BudgetReportService implements IBudgetReportService {
    constructor(
        private readonly budgetService: IBudgetService,
        private readonly cashFlowService: CashFlowService
    ) {}

    /**
     * Gets budget report for a given month and year.
     * Returns Result type for explicit error handling.
     *
     * @param month - Month to get report for (1-12)
     * @param year - Year to get report for
     * @returns Result containing budget report or error
     */
    async getBudgetReport(
        month: number,
        year: number
    ): Promise<Result<BudgetLimitDto[], BudgetError>> {
        const operation = 'getBudgetReport';

        logger.debug({ month, year }, 'Fetching budget report');

        try {
            const [allBudgets, budgetLimits, buckets] = await Promise.all([
                this.budgetService.getBudgets(true),
                this.budgetService.getBudgetLimits(month, year),
                this.cashFlowService.getBuckets(month, year),
            ]);
            if (!buckets.ok) {
                return Result.err(buckets.error);
            }

            // The budget bucket and allocations analyze totals, split by
            // budget (R-BUDGET-1). An inactive budget still gets a row when it
            // has spending or a limit this month, or the rows would not sum to
            // analyze's totals.
            const budgetBucket = buckets.value.budget;
            const allocations = allocationsByBudget(budgetLimits);
            const budgets = allBudgets.filter(
                budget =>
                    budget.attributes.active ||
                    allocations.has(budget.id) ||
                    budgetBucket.some(t => t.budget_id === budget.id)
            );
            const budgetReports: BudgetLimitDto[] = budgets.map(budget => {
                return {
                    budgetId: budget.id,
                    name: budget.attributes.name,
                    amount: allocations.get(budget.id) ?? 0,
                    spent: TransactionCalculationUtils.calculateNetSpend(
                        budgetBucket.filter(t => t.budget_id === budget.id)
                    ),
                };
            });

            logger.debug(
                { month, year, budgetCount: budgetReports.length },
                'Budget report generated successfully'
            );

            return Result.ok(budgetReports);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));

            logger.error(
                {
                    month,
                    year,
                    operation,
                    error: err.message,
                    errorType: err.constructor.name,
                },
                'Failed to get budget report'
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
