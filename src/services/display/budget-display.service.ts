import chalk from 'chalk';
import { BudgetReportDto } from '../../types/dto/budget-report.dto.js';
import { TopExpenseDto } from '../../types/dto/top-expense.dto.js';
import { BudgetInsight } from '../../types/dto/budget-insight.dto.js';
import {
    BillComparisonDto,
    getTopBills,
    getRemainingBills,
} from '../../types/dto/bill-comparison.dto.js';
import { CategorizedUnbudgetedDto } from '../../types/dto/categorized-unbudgeted.dto.js';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { EmojiUtils } from '../../utils/emoji.utils.js';

/**
 * Interface for report data
 */
interface ReportData {
    budgets: BudgetReportDto[];
    topExpenses: TopExpenseDto[];
    billComparison: BillComparisonDto;
    unbudgeted: CategorizedUnbudgetedDto[];
    untracked: CategorizedUnbudgetedDto[];
    insights: BudgetInsight[];
    month: number;
    year: number;
    isCurrentMonth: boolean;
    daysInfo?: {
        daysLeft: number;
    };
}

/**
 * Service for formatting budget reports with insights and visual sections
 * Provides comprehensive display of budget data with emoji indicators and categorized sections
 */
export class BudgetDisplayService {
    private static readonly PROGRESS_BAR_WIDTH = 20;
    private static readonly NAME_COLUMN_WIDTH = 25;
    private static readonly AMOUNT_COLUMN_WIDTH = 12;
    private static readonly SECTION_WIDTH = 79;
    private static readonly DESCRIPTION_MAX_LENGTH = 60;

    constructor(private readonly baseUrl: string = '') {
        // Strip trailing slash to avoid double-slash in constructed URLs
        this.baseUrl = this.baseUrl.replace(/\/+$/, '');
    }

    /**
     * Formats the complete budget report
     * @param data Report data with all sections
     * @param verbose Whether to show detailed information
     * @returns Formatted report string
     */
    formatReport(data: ReportData, verbose = false): string {
        const sections: string[] = [];

        // Header
        sections.push(this.formatOverviewSection(data));

        // Budget sections by status
        const overBudgets = data.budgets.filter(b => b.status === 'over');
        const onTrackBudgets = data.budgets.filter(b => b.status !== 'over');

        if (overBudgets.length > 0) {
            sections.push(
                this.formatAttentionNeededSection(
                    overBudgets,
                    data.billComparison.currencySymbol,
                    verbose
                )
            );
        }

        if (onTrackBudgets.length > 0) {
            sections.push(
                this.formatOnTrackSection(
                    onTrackBudgets,
                    data.billComparison.currencySymbol,
                    verbose
                )
            );
        }

        // Top expenses
        if (data.topExpenses.length > 0) {
            sections.push(this.formatTopExpensesSection(data.topExpenses));
        }

        // Bills section
        sections.push(this.formatBillsSection(data.billComparison, verbose));

        // Unbudgeted expenses — spending the cash-flow net charges to the
        // unbudgeted bucket, the same definition the analyze command uses
        if (data.unbudgeted.length > 0) {
            sections.push(
                this.formatUnbudgetedSection(
                    data.unbudgeted,
                    data.billComparison.currencySymbol,
                    'UNBUDGETED EXPENSES'
                )
            );
        }

        // Spending no bucket accounts for at all
        if (data.untracked.length > 0) {
            sections.push(
                this.formatUnbudgetedSection(
                    data.untracked,
                    data.billComparison.currencySymbol,
                    'UNTRACKED SPENDING',
                    'Charged to no bucket - not counted in the cash-flow net'
                )
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
    private formatOverviewSection(data: ReportData): string {
        const totalSpent = Math.abs(data.budgets.reduce((sum, b) => sum + b.spent, 0));
        const totalBudget = data.budgets.reduce((sum, b) => sum + b.amount, 0);
        const percentageUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
        const isOverBudget = totalSpent > totalBudget;

        const statusEmoji = EmojiUtils.getStatusEmoji(percentageUsed, isOverBudget);

        const header = DisplayFormatterUtils.createBoxHeader(
            `BUDGET REPORT - ${DisplayFormatterUtils.formatMonthYear(data.month, data.year).toUpperCase()}`
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
            const symbol = data.billComparison.currencySymbol;
            const dailyFormatted =
                dailyBudget > 0
                    ? CurrencyUtils.formatWithSymbol(dailyBudget, symbol)
                    : chalk.red(`${CurrencyUtils.formatWithSymbol(0, symbol)} (budget exhausted)`);
            lines.push(`${chalk.bold('Daily Budget:')}     ${dailyFormatted}`);
        }

        lines.push('');
        return lines.join('\n');
    }

    /**
     * Formats the attention needed section (over-budget items)
     */
    private formatAttentionNeededSection(
        budgets: BudgetReportDto[],
        currencySymbol: string,
        verbose = false
    ): string {
        return this.formatBudgetSectionWithConfig(budgets, currencySymbol, verbose, {
            sectionTitle: 'ATTENTION NEEDED',
            statusColor: chalk.red,
            statusEmoji: '🔴',
            formatRemaining: (budget: BudgetReportDto, formatted: string) => `${formatted} over`,
            getRemainingAmount: (budget: BudgetReportDto) => Math.abs(budget.spent) - budget.amount,
        });
    }

    /**
     * Formats the on-track section (under-budget items)
     */
    private formatOnTrackSection(
        budgets: BudgetReportDto[],
        currencySymbol: string,
        verbose = false
    ): string {
        return this.formatBudgetSectionWithConfig(budgets, currencySymbol, verbose, {
            sectionTitle: 'ON TRACK',
            statusColor: chalk.green,
            statusEmoji: '🟢',
            formatRemaining: (budget: BudgetReportDto, formatted: string) => `${formatted} left`,
            getRemainingAmount: (budget: BudgetReportDto) => budget.remaining,
        });
    }

    /**
     * Shared method for formatting budget sections (Attention Needed and On Track)
     * Reduces code duplication between the two methods
     */
    private formatBudgetSectionWithConfig(
        budgets: BudgetReportDto[],
        currencySymbol: string,
        verbose: boolean,
        config: {
            sectionTitle: string;
            statusColor: (str: string) => string;
            statusEmoji: string;
            formatRemaining: (budget: BudgetReportDto, formatted: string) => string;
            getRemainingAmount: (budget: BudgetReportDto) => number;
        }
    ): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader(config.sectionTitle));
        lines.push('');

        // Sort by percentage descending (worst first)
        const sorted = [...budgets].sort((a, b) => b.percentageUsed - a.percentageUsed);

        // Display all budget lines
        sorted.forEach(budget => {
            const spentFormatted = CurrencyUtils.formatWithSymbol(
                Math.abs(budget.spent),
                currencySymbol
            );
            const budgetFormatted = CurrencyUtils.formatWithSymbol(budget.amount, currencySymbol);
            const remaining = config.getRemainingAmount(budget);
            const remainingFormatted = CurrencyUtils.formatWithSymbol(remaining, currencySymbol);

            const progressBar = this.createProgressBar(budget.percentageUsed);
            const remainingText = config.formatRemaining(budget, remainingFormatted);
            const line =
                config.statusColor(config.statusEmoji) +
                ' ' +
                budget.name.padEnd(BudgetDisplayService.NAME_COLUMN_WIDTH) +
                spentFormatted.padStart(12) +
                ' / ' +
                budgetFormatted.padStart(12) +
                '  ' +
                config.statusColor(`${budget.percentageUsed.toFixed(0)}%`.padStart(5)) +
                '  ' +
                config.statusColor(progressBar) +
                '  ' +
                config.statusColor(remainingText);

            lines.push(line);
        });

        lines.push('');

        // Display statistics below all budgets if verbose
        if (verbose) {
            sorted.forEach(budget => {
                const stats = this.formatBudgetStatistics(budget, currencySymbol);
                if (stats) {
                    lines.push(budget.name.toUpperCase());
                    lines.push(stats);
                    lines.push('');
                }
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
            const truncatedDescription = expense.description
                .substring(0, BudgetDisplayService.DESCRIPTION_MAX_LENGTH)
                .padEnd(BudgetDisplayService.DESCRIPTION_MAX_LENGTH);

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
    private formatBudgetStatistics(budget: BudgetReportDto, currencySymbol: string): string {
        const lines: string[] = [];
        const indent = '  '; // 2 spaces for indentation

        // Top Merchant (if available)
        if (budget.transactionStats.topMerchant) {
            const { name, totalSpent, visitCount } = budget.transactionStats.topMerchant;
            const totalFormatted = CurrencyUtils.formatWithSymbol(totalSpent, currencySymbol);
            const visitText = visitCount === 1 ? 'visit' : 'visits';
            lines.push(
                `${indent}📍 Top Merchant: ${name} (${totalFormatted}, ${visitCount} ${visitText})`
            );
        }

        // Historical Comparison (always available)
        const averageSpentFormatted = CurrencyUtils.formatWithSymbol(
            budget.historicalComparison.averageSpent,
            currencySymbol
        );
        lines.push(`${indent}📊 Avg Spending: ${averageSpentFormatted}`);

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

        const varianceDisplay =
            billComparison.variance === 0
                ? chalk.white(`${varianceEmoji} ${varianceFormatted}`)
                : billComparison.variance > 0
                  ? chalk.red(`${varianceEmoji} +${varianceFormatted}`)
                  : chalk.green(`${varianceEmoji} -${varianceFormatted}`);
        const summaryLine = `Expected: ${expectedFormatted}    Actual: ${actualFormatted}    ${varianceDisplay}`;

        lines.push(summaryLine);
        lines.push('');

        // Determine how many bills to show individually (top bills by actual spend)
        const billsToShow = verbose ? billComparison.bills : getTopBills(billComparison);
        const otherBills = verbose ? [] : getRemainingBills(billComparison);

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

            // Truncate as well as pad — a longer name would otherwise shove the
            // amount column right and break alignment
            const name = bill.name
                .substring(0, BudgetDisplayService.NAME_COLUMN_WIDTH)
                .padEnd(BudgetDisplayService.NAME_COLUMN_WIDTH);
            const line = `${varianceEmoji} ${name} ${actualFormatted.padStart(BudgetDisplayService.AMOUNT_COLUMN_WIDTH)}  (expected ${predictedFormatted})`;
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

            // Same shape as the per-bill rows so the amount column lines up
            const line = `${otherVarianceEmoji} ${`Others (${otherBills.length})`.padEnd(
                BudgetDisplayService.NAME_COLUMN_WIDTH
            )} ${otherActualFormatted.padStart(BudgetDisplayService.AMOUNT_COLUMN_WIDTH)}  (expected ${otherPredictedFormatted})`;

            lines.push(line);
        }

        lines.push('');
        return lines.join('\n');
    }

    /**
     * Formats a description with truncation and optional hyperlink
     * Truncates to DESCRIPTION_MAX_LENGTH without ellipsis
     * Wraps with OSC 8 hyperlink if baseUrl and transactionId are available
     */
    private formatDescription(description: string, transactionId: string | undefined): string {
        const truncated = description
            .substring(0, BudgetDisplayService.DESCRIPTION_MAX_LENGTH)
            .padEnd(BudgetDisplayService.DESCRIPTION_MAX_LENGTH);

        const url =
            this.baseUrl && transactionId
                ? DisplayFormatterUtils.transactionUrl(this.baseUrl, transactionId)
                : undefined;
        return DisplayFormatterUtils.createHyperlink(truncated, url);
    }

    /**
     * Formats the unbudgeted expenses section
     */
    private formatUnbudgetedSection(
        unbudgeted: CategorizedUnbudgetedDto[],
        currencySymbol: string,
        header: string,
        subtitle?: string
    ): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader(header));
        lines.push('');
        if (subtitle) {
            lines.push(chalk.dim(`  ${subtitle}`));
            lines.push('');
        }

        let total = 0;

        unbudgeted.forEach(item => {
            const amount = Math.abs(parseFloat(item.transaction.amount));
            total += amount;

            const amountFormatted = CurrencyUtils.formatWithSymbol(
                amount,
                item.transaction.currency_symbol || currencySymbol
            );
            const date = (item.transaction.date || new Date().toISOString()).split('T')[0];

            const transactionId = item.transaction.transaction_journal_id;
            const formattedDescription = this.formatDescription(
                item.transaction.description || 'Transaction',
                transactionId
            );

            const line =
                item.categoryEmoji +
                ' ' +
                formattedDescription +
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
            const { color: iconColor, icon } = BudgetDisplayService.INSIGHT_STYLES[insight.type];
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
            DisplayFormatterUtils.createHorizontalLine('─', BudgetDisplayService.SECTION_WIDTH)
        );
        lines.push('');
        lines.push(
            chalk.cyan('💡 TIP: ') + 'Use --verbose or -v to see all bills and budget statistics'
        );
        lines.push('');
        lines.push(
            DisplayFormatterUtils.createHorizontalLine('─', BudgetDisplayService.SECTION_WIDTH)
        );
        lines.push('');

        return lines.join('\n');
    }

    /**
     * Creates a progress bar
     */
    private createProgressBar(percentage: number): string {
        const filled = Math.min(
            Math.round((percentage / 100) * BudgetDisplayService.PROGRESS_BAR_WIDTH),
            BudgetDisplayService.PROGRESS_BAR_WIDTH
        );
        const empty = BudgetDisplayService.PROGRESS_BAR_WIDTH - filled;

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
     * Color and icon for each insight type. Keyed by the union so a new
     * insight type is a compile error rather than a silent fallback.
     */
    private static readonly INSIGHT_STYLES: Record<
        BudgetInsight['type'],
        { color: (s: string) => string; icon: string }
    > = {
        warning: { color: chalk.yellow, icon: '⚠' },
        success: { color: chalk.green, icon: '✓' },
        alert: { color: chalk.red, icon: '🔴' },
        info: { color: chalk.cyan, icon: '•' },
    };
}
