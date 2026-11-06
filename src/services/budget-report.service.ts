import { BudgetLimitDto } from '../types/dto/budget-limit.dto.js';
import { IBudgetService } from './core/budget.service.interface.js';
import { allocationsByBudget } from './core/budget.service.js';
import { CashFlowService } from './cash-flow.service.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { logger } from '../logger.js';
import { Result } from '../types/result.type.js';
import { MonthError, monthFailure } from '../types/error/month.error.js';

export class BudgetReportService {
    constructor(
        private readonly budgetService: IBudgetService,
        private readonly cashFlowService: CashFlowService
    ) {}

    /**
     * One row per budget for the month: its allocation and what the budget
     * bucket spent against it (R-BUDGET-1).
     *
     * @returns The rows, or the month's error when the budgets, their limits
     *   or the budget bucket could not be read
     */
    async getBudgetReport(
        month: number,
        year: number
    ): Promise<Result<BudgetLimitDto[], MonthError>> {
        try {
            return await this.buildRows(month, year);
        } catch (error) {
            return monthFailure('BUDGET_REPORT_FAILED', { month, year }, error);
        }
    }

    private async buildRows(
        month: number,
        year: number
    ): Promise<Result<BudgetLimitDto[], MonthError>> {
        const [allBudgets, budgetLimits, buckets] = await Promise.all([
            this.budgetService.getBudgets(true),
            this.budgetService.getBudgetLimits(month, year),
            this.cashFlowService.getBuckets(month, year),
        ]);
        if (!buckets.ok) {
            return Result.err(buckets.error);
        }

        // R-BUDGET-1: an inactive budget still gets a row when it has spending
        // or a limit this month, or the rows would not sum to analyze's totals
        const spendingByBudget = Map.groupBy(buckets.value.budget, t => t.budget_id);
        const allocations = allocationsByBudget(budgetLimits);
        const budgets = allBudgets.filter(
            budget =>
                budget.attributes.active ||
                allocations.has(budget.id) ||
                spendingByBudget.has(budget.id)
        );
        const budgetReports: BudgetLimitDto[] = budgets.map(budget => ({
            budgetId: budget.id,
            name: budget.attributes.name,
            amount: allocations.get(budget.id) ?? 0,
            spent: TransactionCalculationUtils.calculateNetSpend(
                spendingByBudget.get(budget.id) ?? []
            ),
        }));

        logger.debug(
            { month, year, budgetCount: budgetReports.length },
            'Budget report generated successfully'
        );

        return Result.ok(budgetReports);
    }
}
