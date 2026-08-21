import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/common.types.js';
import { logger } from '../logger.js';
import ora from 'ora';
import { BudgetAnalyticsService } from '../services/budget-analytics.service.js';
import { BudgetInsightService } from '../services/budget-insight.service.js';
import { BudgetDisplayService } from '../services/display/budget-display.service.js';
import { BudgetReportService } from '../services/budget-report.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { TransactionService } from '../services/core/transaction.service.js';
import { EmojiUtils } from '../utils/emoji.utils.js';
import { CategorizedUnbudgetedDto } from '../types/dto/categorized-unbudgeted.dto.js';

/**
 * Command for displaying budget report with insights and categorized sections
 */
export class BudgetReportCommand implements Command<void, BudgetDateParams> {
    private readonly BUDGET_GEN_FAIL = 'Failed to generate budget report';

    constructor(
        private readonly budgetAnalyticsService: BudgetAnalyticsService,
        private readonly budgetInsightService: BudgetInsightService,
        private readonly budgetDisplayService: BudgetDisplayService,
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
            let daysInfo: { daysLeft: number } | undefined;
            if (isCurrentMonth) {
                const lastUpdatedOn =
                    (await this.transactionService.getMostRecentTransactionDate()) || new Date();
                daysInfo = this.getDaysLeftInfo(month, year, lastUpdatedOn);
            }

            // Fetch all data in parallel
            spinner.text = 'Fetching budget data...';
            const [budgets, topExpenses, billComparisonResult, untrackedTransactions] =
                await Promise.all([
                    this.budgetAnalyticsService.getBudgetReport(month, year, 1),
                    this.budgetAnalyticsService.getTopExpenses(month, year, 5),
                    this.billComparisonService.calculateBillComparison(month, year),
                    this.budgetReportService.getUntrackedTransactions(month, year),
                ]);

            // Map untracked transactions with emoji indicators
            const categorizedUnbudgeted: CategorizedUnbudgetedDto[] = untrackedTransactions.map(
                transaction => ({
                    transaction,
                    categoryEmoji: EmojiUtils.getCategoryEmoji(
                        transaction.category_name || undefined
                    ),
                    categoryName: transaction.category_name || undefined,
                })
            );

            if (!billComparisonResult.ok) {
                spinner.warn('Warning: Bill comparison data unavailable');
                logger.warn(
                    { error: billComparisonResult.error.message },
                    'Failed to fetch bill comparison'
                );
            }

            spinner.text = 'Generating insights...';

            const billComparison = billComparisonResult.ok
                ? billComparisonResult.value
                : this.createEmptyBillComparison();

            // Generate insights from budget data
            const insights = this.budgetInsightService.generateInsights(budgets, billComparison);

            spinner.succeed('Budget report generated');

            // Format and display the report
            const reportData = {
                budgets: budgets,
                topExpenses,
                billComparison,
                unbudgeted: categorizedUnbudgeted,
                insights,
                month,
                year,
                isCurrentMonth,
                daysInfo,
            };

            const formattedReport = this.budgetDisplayService.formatReport(
                reportData,
                verbose || false
            );
            console.log(formattedReport);
        } catch (error) {
            spinner.fail(this.BUDGET_GEN_FAIL);
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error({ error: err.message }, 'Failed to generate budget report');
            throw err;
        }
    }

    /**
     * Gets days left information for current month
     */
    private getDaysLeftInfo(month: number, year: number, lastUpdatedOn: Date) {
        const lastDay = new Date(year, month, 0).getDate();
        const currentDay = lastUpdatedOn.getDate();
        return { daysLeft: Math.max(0, lastDay - currentDay) };
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
