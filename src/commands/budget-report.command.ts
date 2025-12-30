import { BudgetReportService } from '../services/budget-report.service.js';
import { TransactionService } from '../services/core/transaction.service.js';
import { BudgetService } from '../services/core/budget.service.js';
import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/common.types.js';
import { BudgetDisplayService } from '../services/display/budget-display.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../logger.js';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Command for displaying budget report
 */
export class BudgetReportCommand implements Command<void, BudgetDateParams> {
    private readonly BUDGET_GEN_FAIL = 'Failed to generate budget report';

    constructor(
        private readonly budgetReportService: BudgetReportService,
        private readonly transactionService: TransactionService,
        private readonly budgetDisplayService: BudgetDisplayService,
        private readonly billComparisonService: BillComparisonService,
        private readonly budgetService: BudgetService
    ) {}

    /**
     * Executes the budget report command
     * @param params The month and year to display budget report for
     */
    async execute({ month, year, verbose }: BudgetDateParams): Promise<void> {
        const spinner = ora('Generating budget report...').start();

        try {
            const budgetReportsResult = await this.budgetReportService.getBudgetReport(month, year);

            if (!budgetReportsResult.ok) {
                spinner.fail(this.BUDGET_GEN_FAIL);
                console.error(
                    chalk.red('Error fetching budget report:'),
                    chalk.red.bold(budgetReportsResult.error.userMessage)
                );
                throw new Error(budgetReportsResult.error.message);
            }

            const budgetReports = budgetReportsResult.value;
            spinner.succeed('Budget report generated');

            const lastUpdatedOn =
                (await this.transactionService.getMostRecentTransactionDate()) || new Date();
            const isCurrentMonth =
                new Date().getMonth() + 1 === month && new Date().getFullYear() === year;

            const { daysLeft, percentageLeft, currentDay, totalDays } = isCurrentMonth
                ? this.getDaysLeftInfo(month, year, lastUpdatedOn)
                : {
                      daysLeft: 0,
                      percentageLeft: 0,
                      currentDay: 0,
                      totalDays: 0,
                  };

            const totalBudget = budgetReports.reduce((sum, report) => sum + report.amount, 0);
            const totalSpent = budgetReports.reduce((sum, report) => sum + report.spent, 0);
            const totalPercentage = this.getPercentageSpent(totalSpent, totalBudget);

            const unbudgetedTransactions = await this.budgetReportService.getUntrackedTransactions(
                month,
                year
            );

            // Display header
            console.log(
                this.budgetDisplayService.formatHeader(
                    month,
                    year,
                    isCurrentMonth ? daysLeft : undefined,
                    isCurrentMonth ? percentageLeft : undefined,
                    isCurrentMonth ? lastUpdatedOn : undefined
                )
            );

            // Display individual budget items
            const nameWidth = Math.max(...budgetReports.map(report => report.name.length), 20);

            // Pre-fetch all budget transactions in parallel when verbose to avoid N+1 queries
            const budgetTransactionsMap = new Map<string, TransactionSplit[]>();
            const budgetErrorsMap = new Map<string, string>();

            if (verbose) {
                const budgetsWithSpending = budgetReports.filter(b => b.spent !== 0);

                const transactionPromises = budgetsWithSpending.map(async budget => {
                    try {
                        const transactions = await this.getBudgetTransactionsSorted(
                            budget.budgetId,
                            month,
                            year
                        );
                        return { budgetId: budget.budgetId, transactions, error: null };
                    } catch (error) {
                        const err = error instanceof Error ? error : new Error(String(error));
                        return { budgetId: budget.budgetId, transactions: [], error: err.message };
                    }
                });

                const results = await Promise.all(transactionPromises);

                results.forEach(result => {
                    if (result.error) {
                        budgetErrorsMap.set(result.budgetId, result.error);
                        logger.error(
                            { budgetId: result.budgetId, error: result.error },
                            `Failed to fetch transactions for budget ${result.budgetId}`
                        );
                    } else {
                        budgetTransactionsMap.set(result.budgetId, result.transactions);
                    }
                });
            }

            for (const budget of budgetReports) {
                console.log(
                    this.budgetDisplayService.formatBudgetItem(
                        budget,
                        nameWidth,
                        isCurrentMonth,
                        currentDay,
                        totalDays
                    )
                );

                // Show verbose transaction listing if enabled and budget has spending
                if (verbose && budget.spent !== 0) {
                    if (budgetErrorsMap.has(budget.budgetId)) {
                        console.log(
                            chalk.yellow(`  [!] Could not load transactions for ${budget.name}`)
                        );
                    } else {
                        const transactions = budgetTransactionsMap.get(budget.budgetId) || [];
                        const formattedTransactions =
                            this.budgetDisplayService.formatBudgetTransactions(
                                transactions,
                                budget.name
                            );
                        if (formattedTransactions) {
                            console.log(formattedTransactions);
                        }
                    }
                }

                console.log();
            }

            // Display summary
            console.log('─'.repeat(nameWidth + 50));
            console.log(
                this.budgetDisplayService.formatSummary(
                    totalSpent,
                    totalBudget,
                    nameWidth,
                    isCurrentMonth,
                    currentDay,
                    totalDays
                )
            );

            // Display list of unbudgeted transactions
            console.log(
                this.budgetDisplayService.listUnbudgetedTransactions(unbudgetedTransactions)
            );

            // Display bill comparison
            const billComparisonResult = await this.billComparisonService.calculateBillComparison(
                month,
                year
            );

            if (!billComparisonResult.ok) {
                console.error(
                    chalk.red('Error fetching bill comparison:'),
                    chalk.red.bold(billComparisonResult.error.userMessage)
                );
                // Don't throw - bill comparison is supplemental, show what we can
                console.log(chalk.yellow('\n⚠️  Bill comparison data unavailable\n'));
            } else {
                console.log(
                    this.budgetDisplayService.formatBillComparisonSection(
                        billComparisonResult.value,
                        verbose
                    )
                );
            }

            // Display warning if necessary
            if (isCurrentMonth) {
                let warning =
                    this.budgetDisplayService.getSpendRateWarning(
                        totalPercentage,
                        percentageLeft
                    ) ?? '';
                warning +=
                    this.budgetDisplayService.getUnbudgetedExpenseWarning(
                        unbudgetedTransactions.length
                    ) ?? '';
                if (warning) {
                    console.log(warning);
                }
            }
        } catch (error) {
            spinner.fail(this.BUDGET_GEN_FAIL);
            throw error;
        }
    }

    private getDaysLeftInfo(month: number, year: number, lastUpdatedOn: Date) {
        const lastDay = new Date(year, month, 0).getDate();
        const currentDay = lastUpdatedOn.getDate();
        const daysLeft = lastDay - currentDay;
        const percentageLeft = ((lastDay - currentDay) / lastDay) * 100;

        return {
            daysLeft,
            percentageLeft,
            currentDay,
            totalDays: lastDay,
        };
    }

    private getPercentageSpent(spent: number, amount: number): number {
        const percentage = Math.abs(spent) / amount;
        return percentage ? percentage * 100 : 0;
    }

    /**
     * Fetches and sorts transactions for a budget by amount descending
     * @param budgetId The budget ID
     * @param month The month (1-12)
     * @param year The year
     * @returns Sorted transactions (highest amount first)
     */
    private async getBudgetTransactionsSorted(budgetId: string, month: number, year: number) {
        const transactions = await this.budgetService.getTransactionsForBudget(
            budgetId,
            month,
            year
        );

        // Sort by amount descending (highest absolute value first)
        return transactions.sort((a, b) => {
            const amountA = Math.abs(parseFloat(a.amount));
            const amountB = Math.abs(parseFloat(b.amount));
            return amountB - amountA;
        });
    }
}
