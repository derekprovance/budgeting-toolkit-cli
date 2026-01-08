import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/common.types.js';
import { logger } from '../logger.js';
import chalk from 'chalk';
import ora from 'ora';
import { BudgetAnalyticsService } from '../services/budget-analytics.service.js';
import { BudgetInsightService } from '../services/budget-insight.service.js';
import { EnhancedBudgetDisplayService } from '../services/display/enhanced-budget-display.service.js';
import { BudgetReportService } from '../services/budget-report.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { TransactionService } from '../services/core/transaction.service.js';

/**
 * Command for displaying enhanced budget report with insights and categorized sections
 */
export class BudgetReportCommand implements Command<void, BudgetDateParams> {
    private readonly BUDGET_GEN_FAIL = 'Failed to generate budget report';

    constructor(
        private readonly budgetAnalyticsService: BudgetAnalyticsService,
        private readonly budgetInsightService: BudgetInsightService,
        private readonly enhancedBudgetDisplayService: EnhancedBudgetDisplayService,
        private readonly budgetReportService: BudgetReportService,
        private readonly billComparisonService: BillComparisonService,
        private readonly transactionService: TransactionService
    ) {}

    /**
     * Executes the budget report command
     * @param params The month, year, and flags to display budget report for
     */
    async execute({ month, year, verbose }: BudgetDateParams): Promise<void> {
        const spinner = ora('Generating budget report...').start();

        try {
            // Determine if this is the current month
            const isCurrentMonth =
                new Date().getMonth() + 1 === month && new Date().getFullYear() === year;

            // Get days left info for current month
            let daysInfo: { daysLeft: number; percentageLeft: number; currentDay: number; totalDays: number } | undefined;
            if (isCurrentMonth) {
                const lastUpdatedOn =
                    (await this.transactionService.getMostRecentTransactionDate()) || new Date();
                daysInfo = this.getDaysLeftInfo(month, year, lastUpdatedOn);
            }

            // Fetch all data in parallel
            spinner.text = 'Fetching enhanced budget data...';
            const [enhancedBudgets, topExpenses, billComparisonResult, categorizedUnbudgeted] =
                await Promise.all([
                    this.budgetAnalyticsService.getEnhancedBudgetReport(month, year, 1),
                    this.budgetAnalyticsService.getTopExpenses(month, year, 5),
                    this.billComparisonService.calculateBillComparison(month, year),
                    this.budgetReportService.getCategorizedUnbudgetedTransactions(month, year),
                ]);

            if (!billComparisonResult.ok) {
                spinner.warn('Warning: Bill comparison data unavailable');
                logger.warn(
                    { error: billComparisonResult.error.message },
                    'Failed to fetch bill comparison'
                );
            }

            spinner.text = 'Generating insights...';

            // Generate insights from budget data
            const insights = this.budgetInsightService.generateInsights(
                enhancedBudgets,
                billComparisonResult.ok ? billComparisonResult.value : this.createEmptyBillComparison()
            );

            spinner.succeed('Budget report generated');

            // Format and display the enhanced report
            const reportData = {
                budgets: enhancedBudgets,
                topExpenses,
                billComparison: billComparisonResult.ok
                    ? billComparisonResult.value
                    : this.createEmptyBillComparison(),
                unbudgeted: categorizedUnbudgeted,
                insights,
                month,
                year,
                isCurrentMonth,
                daysInfo,
            };

            const formattedReport = this.enhancedBudgetDisplayService.formatEnhancedReport(reportData);
            console.log(formattedReport);

            // If verbose flag is set, show transaction details
            if (verbose) {
                await this.displayVerboseTransactions(enhancedBudgets);
            }
        } catch (error) {
            spinner.fail(this.BUDGET_GEN_FAIL);
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error({ error: err.message }, 'Failed to generate budget report');
            throw err;
        }
    }

    /**
     * Displays verbose transaction details for budgets
     */
    private async displayVerboseTransactions(budgets: any[]): Promise<void> {
        // Placeholder for verbose transaction display
        // In the future, this could show detailed transaction lists per budget
        logger.debug('Verbose flag set - transaction details available via --category flag');
    }

    /**
     * Gets days left information for current month
     */
    private getDaysLeftInfo(month: number, year: number, lastUpdatedOn: Date) {
        const lastDay = new Date(year, month, 0).getDate();
        const currentDay = lastUpdatedOn.getDate();
        const daysLeft = Math.max(0, lastDay - currentDay);
        const percentageLeft = ((lastDay - currentDay) / lastDay) * 100;

        return {
            daysLeft,
            percentageLeft,
            currentDay,
            totalDays: lastDay,
        };
    }

    /**
     * Creates an empty bill comparison DTO for error cases
     */
    private createEmptyBillComparison() {
        return {
            predictedTotal: 0,
            actualTotal: 0,
            variance: 0,
            bills: [],
            currencyCode: 'USD',
            currencySymbol: '$',
        };
    }
}
