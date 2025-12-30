import { BudgetReportDto } from '../types/dto/budget-report.dto.js';
import { BudgetService } from './core/budget.service.js';
import { BudgetReportService as IBudgetReportService } from '../types/interface/budget-report.service.interface.js';
import { DateUtils } from '../utils/date.utils.js';
import { logger } from '../logger.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { TransactionClassificationService } from './core/transaction-classification.service.js';
import { Result } from '../types/result.type.js';
import { BudgetError, BudgetErrorFactory, BudgetErrorType } from '../types/error/budget.error.js';

export class BudgetReportService implements IBudgetReportService {
    constructor(
        private budgetService: BudgetService,
        private readonly transactionClassificationService: TransactionClassificationService
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
    ): Promise<Result<BudgetReportDto[], BudgetError>> {
        const operation = 'getBudgetReport';

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

        logger.debug({ month, year }, 'Fetching budget report');

        try {
            // Fetch all required data in parallel
            const [budgets, insights, budgetLimits] = await Promise.all([
                this.budgetService.getBudgets(),
                this.budgetService.getBudgetExpenseInsights(month, year),
                this.budgetService.getBudgetLimits(month, year),
            ]);

            // Build report from fetched data
            const budgetReports: BudgetReportDto[] = budgets.map(budget => {
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
                    spent: insight ? insight.difference_float : 0.0,
                } as BudgetReportDto;
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
