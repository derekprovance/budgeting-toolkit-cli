import chalk from 'chalk';
import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/common.types.js';
import { logger } from '../logger.js';
import ora from 'ora';
import { BudgetAnalyticsService } from '../services/budget-analytics.service.js';
import { BudgetInsightService } from '../services/budget-insight.service.js';
import { BudgetDisplayService } from '../services/display/budget-display.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { TransactionService } from '../services/core/transaction.service.js';
import { EmojiUtils } from '../utils/emoji.utils.js';
import { CategorizedUnbudgetedDto } from '../types/dto/categorized-unbudgeted.dto.js';
import { CashFlowService } from '../services/cash-flow.service.js';
import { BudgetReportDto } from '../types/dto/budget-report.dto.js';
import { TopExpenseDto } from '../types/dto/top-expense.dto.js';
import { BillComparisonDto } from '../types/dto/bill-comparison.dto.js';
import { BudgetInsight } from '../types/dto/budget-insight.dto.js';
import { serializeBudgetReport } from '../services/display/budget-report-json.serializer.js';

/**
 * Everything BudgetReportCommand computed for one month — what the text
 * report and the JSON document are both built from.
 */
export interface BudgetReportResult {
    budgets: BudgetReportDto[];
    topExpenses: TopExpenseDto[];
    billComparison: BillComparisonDto;
    unbudgeted: CategorizedUnbudgetedDto[];
    insights: BudgetInsight[];
    month: number;
    year: number;
    isCurrentMonth: boolean;
    daysInfo?: { daysLeft: number; dataThrough?: Date };
}

/**
 * Command for displaying budget report with insights and categorized sections
 */
export class BudgetReportCommand implements Command<BudgetReportResult, BudgetDateParams> {
    private readonly BUDGET_GEN_FAIL = 'Failed to generate budget report';

    constructor(
        private readonly budgetAnalyticsService: BudgetAnalyticsService,
        private readonly budgetInsightService: BudgetInsightService,
        private readonly budgetDisplayService: BudgetDisplayService,
        private readonly billComparisonService: BillComparisonService,
        private readonly transactionService: TransactionService,
        private readonly cashFlowService: CashFlowService
    ) {}

    /**
     * Executes the budget report command
     *
     * In `json` format the spinner is silenced and stdout carries nothing but
     * the JSON document, so it stays parseable; warnings go to stderr.
     *
     * @param params The month, year, and flags to display budget report for
     * @returns The report data the output was built from
     */
    async execute({
        month,
        year,
        verbose,
        format = 'text',
    }: BudgetDateParams): Promise<BudgetReportResult> {
        const json = format === 'json';
        const spinner = ora({ text: 'Generating budget report...', isSilent: json }).start();

        try {
            // Determine if this is the current month
            const isCurrentMonth =
                new Date().getMonth() + 1 === month && new Date().getFullYear() === year;

            // Get days left info for current month
            let daysInfo: { daysLeft: number; dataThrough?: Date } | undefined;
            if (isCurrentMonth) {
                daysInfo = {
                    ...this.getDaysLeftInfo(month, year),
                    // Kept as its own signal rather than folded into daysLeft:
                    // a month can look cheap simply because the last few days
                    // have not been imported yet.
                    dataThrough:
                        (await this.transactionService.getMostRecentTransactionDate()) ?? undefined,
                };
            }

            // Fetch all data in parallel
            spinner.text = 'Fetching budget data...';
            const [budgets, topExpenses, billComparisonResult, bucketsResult] = await Promise.all([
                this.budgetAnalyticsService.getBudgetReport(month, year, 1),
                this.budgetAnalyticsService.getTopExpenses(month, year, 5),
                this.billComparisonService.calculateBillComparison(month, year),
                this.cashFlowService.getBuckets(month, year),
            ]);

            if (!bucketsResult.ok) {
                spinner.fail('Failed to generate budget report');
                console.error(
                    chalk.red('Error sorting transactions:'),
                    chalk.red.bold(bucketsResult.error.userMessage)
                );
                throw new Error(bucketsResult.error.message);
            }

            // The bucket that feeds the cash-flow net, same definition analyze uses
            const categorizedUnbudgeted: CategorizedUnbudgetedDto[] =
                bucketsResult.value.unbudgeted.map(transaction => ({
                    transaction,
                    categoryEmoji: EmojiUtils.getCategoryEmoji(
                        transaction.category_name || undefined
                    ),
                    categoryName: transaction.category_name || undefined,
                }));

            if (!billComparisonResult.ok) {
                spinner.warn('Warning: Bill comparison data unavailable');
                if (json) {
                    // The spinner is silent in JSON mode; keep the warning visible
                    console.error('Warning: Bill comparison data unavailable');
                }
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
            const reportData: BudgetReportResult = {
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

            if (json) {
                console.log(JSON.stringify(serializeBudgetReport(reportData), null, 2));
            } else {
                const formattedReport = this.budgetDisplayService.formatReport(
                    reportData,
                    verbose || false
                );
                console.log(formattedReport);
            }

            return reportData;
        } catch (error) {
            // A Result error already failed the spinner; only an unexpected
            // throw leaves it spinning (AnalyzeCommand does the same)
            if (spinner.isSpinning) {
                spinner.fail(this.BUDGET_GEN_FAIL);
            }
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error({ error: err.message }, 'Failed to generate budget report');
            throw err;
        }
    }

    /**
     * Days left in the month, counted from today and INCLUDING today.
     *
     * Today is a day you can still spend, so the last day of the month has one
     * day left, not zero. Excluding it divided the remaining budget by one day
     * too few every day, and on the final day produced a zero that
     * BudgetDisplayService renders as "budget exhausted" no matter how much is
     * actually left.
     *
     * Deliberately not derived from the most recent transaction's date: that
     * answers "how stale is my data", not "how long do I have", and using it
     * reported 12 days left on the 24th of a 31-day month.
     */
    private getDaysLeftInfo(month: number, year: number, today: Date = new Date()) {
        const lastDay = new Date(year, month, 0).getDate();
        return { daysLeft: Math.max(0, lastDay - today.getDate() + 1) };
    }

    /**
     * Creates an empty bill comparison DTO for error cases
     */
    private createEmptyBillComparison() {
        return BillComparisonDto.empty();
    }
}
