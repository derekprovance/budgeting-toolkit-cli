import chalk from 'chalk';
import { EnhancedBudgetReportDto } from '../../types/dto/enhanced-budget-report.dto.js';
import { TopExpenseDto } from '../../types/dto/top-expense.dto.js';
import { BudgetInsight } from '../../types/dto/budget-insight.dto.js';
import { BillComparisonDto } from '../../types/dto/bill-comparison.dto.js';
import { CategorizedUnbudgetedDto } from '../../types/dto/categorized-unbudgeted.dto.js';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { EmojiUtils } from '../../utils/emoji.utils.js';

/**
 * Interface for enhanced report data
 */
interface EnhancedReportData {
    budgets: EnhancedBudgetReportDto[];
    topExpenses: TopExpenseDto[];
    billComparison: BillComparisonDto;
    unbudgeted: CategorizedUnbudgetedDto[];
    insights: BudgetInsight[];
    month: number;
    year: number;
    isCurrentMonth: boolean;
    daysInfo?: {
        daysLeft: number;
        percentageLeft: number;
        currentDay: number;
        totalDays: number;
    };
}

/**
 * Service for formatting enhanced budget reports with insights and visual sections
 * Provides comprehensive display of budget data with emoji indicators and categorized sections
 */
export class EnhancedBudgetDisplayService {
    private static readonly PROGRESS_BAR_WIDTH = 20;
    private static readonly NAME_COLUMN_WIDTH = 25;
    private static readonly SECTION_WIDTH = 79;

    /**
     * Formats the complete enhanced budget report
     * @param data Enhanced report data with all sections
     * @param verbose Whether to show detailed information
     * @returns Formatted report string
     */
    formatEnhancedReport(data: EnhancedReportData, verbose = false): string {
        const sections: string[] = [];

        // Header
        sections.push(this.formatOverviewSection(data));

        // Budget sections by status
        const overBudgets = data.budgets.filter(b => b.status === 'over');
        const onTrackBudgets = data.budgets.filter(b => b.status !== 'over');

        if (overBudgets.length > 0) {
            sections.push(
                this.formatAttentionNeededSection(overBudgets, data.billComparison.currencySymbol, verbose)
            );
        }

        if (onTrackBudgets.length > 0) {
            sections.push(
                this.formatOnTrackSection(onTrackBudgets, data.billComparison.currencySymbol, verbose)
            );
        }

        // Top expenses
        if (data.topExpenses.length > 0) {
            sections.push(this.formatTopExpensesSection(data.topExpenses));
        }

        // Bills section
        sections.push(this.formatBillsSection(data.billComparison, verbose));

        // Unbudgeted expenses
        if (data.unbudgeted.length > 0) {
            sections.push(
                this.formatUnbudgetedSection(data.unbudgeted, data.billComparison.currencySymbol)
            );
        }

        // Insights
        if (data.insights.length > 0) {
            sections.push(this.formatInsightsSection(data.insights));
        }

        // Footer
        sections.push(this.formatFooterTip());

        return sections.join('\n');
    }

    /**
     * Formats the overview section with summary and status
     */
    private formatOverviewSection(data: EnhancedReportData): string {
        const monthName = new Date(data.year, data.month - 1).toLocaleString('default', {
            month: 'long',
        });

        const totalSpent = Math.abs(data.budgets.reduce((sum, b) => sum + b.spent, 0));
        const totalBudget = data.budgets.reduce((sum, b) => sum + b.amount, 0);
        const percentageUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
        const isOverBudget = totalSpent > totalBudget;

        const statusEmoji = EmojiUtils.getStatusEmoji(percentageUsed, isOverBudget);

        const header = DisplayFormatterUtils.createBoxHeader(
            `BUDGET REPORT - ${monthName.toUpperCase()} ${data.year}`
        );

        const lines: string[] = [header, ''];

        // Total spent line
        const spentFormatted = CurrencyUtils.formatWithSymbol(
            totalSpent,
            data.billComparison.currencySymbol
        );
        const budgetFormatted = CurrencyUtils.formatWithSymbol(
            totalBudget,
            data.billComparison.currencySymbol
        );
        lines.push(`${chalk.bold('Total Spent:')}      ${spentFormatted} / ${budgetFormatted}`);

        // Status line
        if (isOverBudget) {
            const overAmount = totalSpent - totalBudget;
            const overFormatted = CurrencyUtils.formatWithSymbol(
                overAmount,
                data.billComparison.currencySymbol
            );
            lines.push(
                `${chalk.bold('Status:')}           ${statusEmoji} OVER BUDGET by ${overFormatted} (${percentageUsed.toFixed(1)}%)`
            );
        } else {
            lines.push(
                `${chalk.bold('Status:')}           ${statusEmoji} ON TRACK (${percentageUsed.toFixed(1)}% spent)`
            );
        }

        // Days remaining (for current month only)
        if (data.isCurrentMonth && data.daysInfo) {
            lines.push(`${chalk.bold('Days Remaining:')}   ${data.daysInfo.daysLeft} days`);
            const dailyBudget =
                data.daysInfo.daysLeft > 0
                    ? (totalBudget - totalSpent) / data.daysInfo.daysLeft
                    : 0;
            const dailyFormatted = CurrencyUtils.formatWithSymbol(
                Math.max(0, dailyBudget),
                data.billComparison.currencySymbol
            );
            lines.push(
                `${chalk.bold('Daily Budget:')}     ${dailyBudget > 0 ? dailyFormatted : chalk.red('$0.00 (budget exhausted)')}`
            );
        }

        lines.push('');
        return lines.join('\n');
    }

    /**
     * Formats the attention needed section (over-budget items)
     */
    private formatAttentionNeededSection(
        budgets: EnhancedBudgetReportDto[],
        currencySymbol: string,
        verbose = false
    ): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader('ATTENTION NEEDED'));
        lines.push('');

        // Sort by percentage descending (worst first)
        const sorted = [...budgets].sort((a, b) => b.percentageUsed - a.percentageUsed);

        sorted.forEach(budget => {
            const spentFormatted = CurrencyUtils.formatWithSymbol(
                Math.abs(budget.spent),
                currencySymbol
            );
            const budgetFormatted = CurrencyUtils.formatWithSymbol(budget.amount, currencySymbol);
            const remaining = Math.abs(budget.spent) - budget.amount;
            const remainingFormatted = CurrencyUtils.formatWithSymbol(remaining, currencySymbol);

            const progressBar = this.createProgressBar(budget.percentageUsed);
            const line =
                chalk.red('🔴') +
                ' ' +
                budget.name.padEnd(EnhancedBudgetDisplayService.NAME_COLUMN_WIDTH) +
                spentFormatted.padStart(12) +
                ' / ' +
                budgetFormatted.padStart(12) +
                '  ' +
                chalk.red(`${budget.percentageUsed.toFixed(0)}%`.padStart(5)) +
                '  ' +
                chalk.red(progressBar) +
                '  ' +
                chalk.red(`+${remainingFormatted}`);

            lines.push(line);
        });

        lines.push('');

        // Display statistics below all budgets if verbose
        if (verbose) {
            sorted.forEach(budget => {
                lines.push(budget.name.toUpperCase());
                const stats = this.formatBudgetStatistics(budget, currencySymbol);
                if (stats) {
                    lines.push(stats);
                }
                lines.push('');
            });
        }

        lines.push('');
        return lines.join('\n');
    }

    /**
     * Formats the on-track section (under-budget items)
     */
    private formatOnTrackSection(
        budgets: EnhancedBudgetReportDto[],
        currencySymbol: string,
        verbose = false
    ): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader('ON TRACK'));
        lines.push('');

        // Sort by percentage descending
        const sorted = [...budgets].sort((a, b) => b.percentageUsed - a.percentageUsed);

        sorted.forEach(budget => {
            const spentFormatted = CurrencyUtils.formatWithSymbol(
                Math.abs(budget.spent),
                currencySymbol
            );
            const budgetFormatted = CurrencyUtils.formatWithSymbol(budget.amount, currencySymbol);

            const progressBar = this.createProgressBar(budget.percentageUsed);
            const remainingFormatted = CurrencyUtils.formatWithSymbol(
                budget.remaining,
                currencySymbol
            );

            const line =
                chalk.green('🟢') +
                ' ' +
                budget.name.padEnd(EnhancedBudgetDisplayService.NAME_COLUMN_WIDTH) +
                spentFormatted.padStart(12) +
                ' / ' +
                budgetFormatted.padStart(12) +
                '  ' +
                chalk.green(`${budget.percentageUsed.toFixed(0)}%`.padStart(5)) +
                '  ' +
                chalk.green(progressBar) +
                '  ' +
                chalk.green(`${remainingFormatted} left`);

            lines.push(line);
        });

        lines.push('');

        // Display statistics below all budgets if verbose
        if (verbose) {
            sorted.forEach(budget => {
                lines.push(budget.name.toUpperCase());
                const stats = this.formatBudgetStatistics(budget, currencySymbol);
                if (stats) {
                    lines.push(stats);
                }
                lines.push('');
            });
        }

        lines.push('');
        return lines.join('\n');
    }

    /**
     * Formats the top expenses section
     */
    private formatTopExpensesSection(expenses: TopExpenseDto[]): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader('TOP EXPENSES'));
        lines.push('');

        expenses.forEach((expense, index) => {
            const amountFormatted = CurrencyUtils.formatWithSymbol(
                expense.amount,
                expense.currencySymbol
            );
            const truncatedDescription = expense.description.substring(0, 35).padEnd(35);

            const line =
                chalk.gray(`${index + 1}. `) +
                amountFormatted.padStart(12) +
                '   ' +
                truncatedDescription +
                '  ' +
                chalk.gray(`(${expense.budgetName})`) +
                '  ' +
                chalk.gray(expense.date);

            lines.push(line);
        });

        lines.push('');
        return lines.join('\n');
    }

    /**
     * Formats budget statistics for verbose output
     */
    private formatBudgetStatistics(budget: EnhancedBudgetReportDto, currencySymbol: string): string {
        const lines: string[] = [];
        const indent = '  '; // 2 spaces for indentation

        // Top Merchant (if available)
        if (budget.transactionStats.topMerchant) {
            const { name, totalSpent, visitCount } = budget.transactionStats.topMerchant;
            const totalFormatted = CurrencyUtils.formatWithSymbol(totalSpent, currencySymbol);
            const visitText = visitCount === 1 ? 'visit' : 'visits';
            lines.push(`${indent}📍 Top Merchant: ${name} (${totalFormatted}, ${visitCount} ${visitText})`);
        }

        // Spending Trend (if available)
        if (budget.transactionStats.spendingTrend) {
            const { direction, difference, percentageChange } = budget.transactionStats.spendingTrend;

            let trendEmoji = '➡️';
            let trendText = 'Stable';
            let trendColor = chalk.gray;

            if (direction === 'increasing') {
                trendEmoji = '📈 ↑';
                trendText = 'Increasing';
                trendColor = chalk.red;
            } else if (direction === 'decreasing') {
                trendEmoji = '📉 ↓';
                trendText = 'Decreasing';
                trendColor = chalk.green;
            }

            const diffFormatted = CurrencyUtils.formatWithSymbol(Math.abs(difference), currencySymbol);
            const pctFormatted = Math.abs(percentageChange).toFixed(1);
            const sign = difference >= 0 ? '+' : '-';

            lines.push(
                `${indent}${trendEmoji} Trend: ${trendColor(`${trendText} vs last month (${sign}${diffFormatted}, ${sign}${pctFormatted}%)`)}`
            );
        }

        // Historical Comparison (always available)
        const threeMonthAvgFormatted = CurrencyUtils.formatWithSymbol(
            budget.historicalComparison.threeMonthAvg,
            currencySymbol
        );
        lines.push(`${indent}📊 3-Month Avg: ${threeMonthAvgFormatted}`);

        return lines.join('\n');
    }

    /**
     * Formats the bills and recurring section
     */
    private formatBillsSection(billComparison: BillComparisonDto, verbose = false): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader('BILLS & RECURRING'));
        lines.push('');

        const expectedFormatted = CurrencyUtils.formatWithSymbol(
            billComparison.predictedTotal,
            billComparison.currencySymbol
        );
        const actualFormatted = CurrencyUtils.formatWithSymbol(
            billComparison.actualTotal,
            billComparison.currencySymbol
        );

        const varianceEmoji = EmojiUtils.getBillVarianceEmoji(
            billComparison.variance,
            billComparison.predictedTotal
        );
        const varianceFormatted = CurrencyUtils.formatWithSymbol(
            Math.abs(billComparison.variance),
            billComparison.currencySymbol
        );

        const summaryLine =
            `Expected: ${expectedFormatted}    Actual: ${actualFormatted}    ` +
            (billComparison.variance > 0
                ? chalk.red(`${varianceEmoji} +${varianceFormatted}`)
                : chalk.green(`${varianceEmoji} -${varianceFormatted}`));

        lines.push(summaryLine);
        lines.push('');

        // Determine how many bills to show individually
        const billsToShow = verbose ? billComparison.bills : billComparison.bills.slice(0, 4);
        const otherBills = verbose ? [] : billComparison.bills.slice(4);

        billsToShow.forEach(bill => {
            const predictedFormatted = CurrencyUtils.formatWithSymbol(
                bill.predicted,
                billComparison.currencySymbol
            );
            const actualFormatted = CurrencyUtils.formatWithSymbol(
                bill.actual,
                billComparison.currencySymbol
            );
            const variance = bill.actual - bill.predicted;
            const varianceEmoji = EmojiUtils.getBillVarianceEmoji(variance, bill.predicted);

            const line = `${varianceEmoji} ${bill.name.padEnd(25)} ${actualFormatted.padStart(12)}  (expected ${predictedFormatted})`;
            lines.push(line);
        });

        // Only show "Others" grouping if not verbose and there are other bills
        if (otherBills.length > 0) {
            const otherActual = otherBills.reduce((sum, b) => sum + b.actual, 0);
            const otherPredicted = otherBills.reduce((sum, b) => sum + b.predicted, 0);
            const otherVariance = otherActual - otherPredicted;
            const otherVarianceEmoji = EmojiUtils.getBillVarianceEmoji(
                otherVariance,
                otherPredicted
            );

            const otherActualFormatted = CurrencyUtils.formatWithSymbol(
                otherActual,
                billComparison.currencySymbol
            );
            const otherPredictedFormatted = CurrencyUtils.formatWithSymbol(
                otherPredicted,
                billComparison.currencySymbol
            );

            const line = `${otherVarianceEmoji} Others (${otherBills.length})${' '.repeat(
                20 - String(otherBills.length).length
            )}${otherActualFormatted.padStart(12)}  (expected ${otherPredictedFormatted})`;

            lines.push(line);
        }

        lines.push('');
        return lines.join('\n');
    }

    /**
     * Formats the unbudgeted expenses section
     */
    private formatUnbudgetedSection(
        unbudgeted: CategorizedUnbudgetedDto[],
        currencySymbol: string
    ): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader('UNBUDGETED EXPENSES'));
        lines.push('');

        let total = 0;

        unbudgeted.forEach(item => {
            const amount = Math.abs(parseFloat(item.transaction.amount));
            total += amount;

            const amountFormatted = CurrencyUtils.formatWithSymbol(
                amount,
                item.transaction.currency_symbol || currencySymbol
            );
            const date = item.transaction.date || new Date().toISOString().split('T')[0];

            const line =
                item.categoryEmoji +
                ' ' +
                (item.transaction.description || 'Transaction').padEnd(35) +
                ' ' +
                amountFormatted.padStart(12) +
                '   ' +
                chalk.gray(date);

            lines.push(line);
        });

        lines.push('');
        lines.push(chalk.bold(`Total: ${CurrencyUtils.formatWithSymbol(total, currencySymbol)}`));
        lines.push('');
        return lines.join('\n');
    }

    /**
     * Formats the insights section
     */
    private formatInsightsSection(insights: BudgetInsight[]): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader('INSIGHTS'));
        lines.push('');

        insights.forEach(insight => {
            const iconColor = this.getInsightColor(insight.type);
            const icon = this.getInsightIcon(insight.type);
            const line = iconColor(`${icon} ${insight.message}`);
            lines.push(line);
        });

        lines.push('');
        return lines.join('\n');
    }

    /**
     * Formats the footer tip
     */
    private formatFooterTip(): string {
        const lines: string[] = [];
        lines.push(
            DisplayFormatterUtils.createHorizontalLine(
                '─',
                EnhancedBudgetDisplayService.SECTION_WIDTH
            )
        );
        lines.push('');
        lines.push(
            chalk.cyan('💡 TIP: ') +
                'Use --verbose or -v to see all bills and budget statistics,\n' +
                '   --details to see all transactions, or --category "Name" for specific breakdown'
        );
        lines.push('');
        lines.push(
            DisplayFormatterUtils.createHorizontalLine(
                '─',
                EnhancedBudgetDisplayService.SECTION_WIDTH
            )
        );
        lines.push('');

        return lines.join('\n');
    }

    /**
     * Creates a progress bar
     */
    private createProgressBar(percentage: number): string {
        const filled = Math.min(
            Math.round((percentage / 100) * EnhancedBudgetDisplayService.PROGRESS_BAR_WIDTH),
            EnhancedBudgetDisplayService.PROGRESS_BAR_WIDTH
        );
        const empty = EnhancedBudgetDisplayService.PROGRESS_BAR_WIDTH - filled;

        let bar = '';
        for (let i = 0; i < filled; i++) {
            bar += '▓';
        }
        for (let i = 0; i < empty; i++) {
            bar += '░';
        }

        return `[${bar}]`;
    }

    /**
     * Gets color for insight type
     */
    private getInsightColor(type: string): (s: string) => string {
        switch (type) {
            case 'warning':
                return chalk.yellow;
            case 'success':
                return chalk.green;
            case 'alert':
                return chalk.red;
            case 'info':
            default:
                return chalk.cyan;
        }
    }

    /**
     * Gets icon for insight type
     */
    private getInsightIcon(type: string): string {
        switch (type) {
            case 'warning':
                return '⚠';
            case 'success':
                return '✓';
            case 'alert':
                return '🔴';
            case 'info':
            default:
                return '•';
        }
    }
}
