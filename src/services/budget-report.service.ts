import { BudgetLimitDto } from '../types/dto/budget-limit.dto.js';
import { IBudgetService } from './core/budget.service.interface.js';
import { BudgetReportService as IBudgetReportService } from '../types/interface/budget-report.service.interface.js';
import { DateUtils } from '../utils/date.utils.js';
import { logger } from '../logger.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { Result } from '../types/result.type.js';
import { BudgetError, BudgetErrorFactory, BudgetErrorType } from '../types/error/budget.error.js';
import { IExcludedTransactionService } from './excluded-transaction.service.interface.js';

export class BudgetReportService implements IBudgetReportService {
    constructor(
        private budgetService: IBudgetService,
        private readonly transactionClassificationService: ITransactionClassificationService,
        private readonly excludedTransactionService: IExcludedTransactionService
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
                    // insight/expense/budget reports difference_float as a
                    // NEGATIVE number per budget. Negate once here so `spent` is
                    // positive-for-spending everywhere downstream, matching
                    // BudgetSurplusService. Math.abs() per budget would be
                    // wrong: a budget whose refunds exceed its outflows reports
                    // a positive difference_float, and taking its absolute value
                    // would count that refund as spending.
                    spent: insight ? -(insight.difference_float ?? 0.0) : 0.0,
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
     * Gets the spending that no bucket accounts for — the genuine "fell through
     * the cracks" list.
     *
     * A withdrawal is charged exactly once across the report's buckets: budget,
     * bill, disposable income, or unbudgeted. Anything left over is invisible to
     * the cash-flow net, which is precisely what makes it worth surfacing.
     *
     * Rules:
     * - Must not have a budget (the endpoint guarantees this)
     * - Must not be a bill — tracked by BillComparisonService
     * - Must not be disposable income — tracked by DisposableIncomeService
     * - Must not already be in the unbudgeted bucket — tracked by
     *   UnbudgetedExpenseService, which is what feeds netImpact
     * - Must not be globally excluded
     *
     * In practice what survives is spending from an account outside
     * `expenseSourceAccounts`, which the unbudgeted bucket deliberately ignores.
     *
     * @param unbudgetedExpenses The unbudgeted bucket for the same month, from
     *   `UnbudgetedExpenseService`. Passed in rather than recomputed so both
     *   sections of the report derive from one calculation.
     */
    async getUntrackedTransactions(
        month: number,
        year: number,
        unbudgetedExpenses: TransactionSplit[] = []
    ): Promise<TransactionSplit[]> {
        const transactions = await this.budgetService.getTransactionsWithoutBudget(month, year);

        const alreadyCounted = new Set(
            unbudgetedExpenses.map(t => t.transaction_journal_id).filter(Boolean)
        );

        return transactions.filter(
            t =>
                !this.transactionClassificationService.isBill(t) &&
                !this.transactionClassificationService.isDisposableIncome(t) &&
                !alreadyCounted.has(t.transaction_journal_id) &&
                // This endpoint bypasses TransactionService, so the global
                // exclusion list has to be applied here too
                !this.excludedTransactionService.isExcludedTransaction(t.description, t.amount)
        );
    }
}
