import { BudgetLimitDto } from '../types/dto/budget-limit.dto.js';
import { IBudgetService } from './core/budget.service.interface.js';
import { BudgetReportService as IBudgetReportService } from '../types/interface/budget-report.service.interface.js';
import { DateUtils } from '../utils/date.utils.js';
import { logger } from '../logger.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { Result } from '../types/result.type.js';
import { BudgetError, BudgetErrorFactory, BudgetErrorType } from '../types/error/budget.error.js';

export class BudgetReportService implements IBudgetReportService {
    constructor(
        private budgetService: IBudgetService,
        private readonly transactionClassificationService: ITransactionClassificationService
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

        const dateValidation = DateUtils.validateMonthYearResult(
            month,
            year,
            operation,
            (m, y, op, err) =>
                BudgetErrorFactory.create(BudgetErrorType.INVALID_DATE, m, y, op, err)
        );
        if (!dateValidation.ok) {
            return Result.err(dateValidation.error);
        }

        logger.debug({ month, year }, 'Fetching budget report');

        try {
            // Fetch all required data in parallel
            const [budgets, insights, budgetLimits] = await Promise.all([
                this.budgetService.getBudgets(),
                this.budgetService.getBudgetExpenseInsights(month, year),
                this.budgetService.getBudgetLimits(month, year),
            ]);

            // Build report from fetched data
            const budgetReports: BudgetLimitDto[] = budgets.map(budget => {
                const budgetName = budget.attributes.name;
                const budgetId = budget.id;

                const budgetLimit = budgetLimits.find(
                    limit => limit.attributes.budget_id === budgetId
                );
                const insight = insights.find(insight => insight.id == budgetId);

                return {
                    budgetId: budgetId,
                    name: budgetName,
                    amount: budgetLimit ? Number(budgetLimit.attributes.amount) : 0.0,
                    spent: insight ? (insight.difference_float ?? 0.0) : 0.0,
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

    /**
     * Gets the untracked transactions for a particular budget. Usually indicates something fell through the cracks.
     *
     * We follow the following rules to create this list:
     * - Must not have a budget
     * - Must not be a bill, these are tracked outside of the budget
     * - Must not be disposable income, this is also tracked outside of the budget
     */
    async getUntrackedTransactions(month: number, year: number): Promise<TransactionSplit[]> {
        let transactions = await this.budgetService.getTransactionsWithoutBudget(month, year);

        transactions = transactions.filter(t => {
            return (
                !this.transactionClassificationService.isBill(t) &&
                !this.transactionClassificationService.isDisposableIncome(t)
            );
        });

        return transactions;
    }
}
