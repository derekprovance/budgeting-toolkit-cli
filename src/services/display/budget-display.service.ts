import chalk, { ChalkInstance } from 'chalk';
import {
    BudgetReportDto as BudgetReport,
    HistoricalComparisonDto,
    TransactionStats,
} from '../../types/dto/budget-report.dto.js';
import { BaseTransactionDisplayService } from './base-transaction-display.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BillComparisonDto } from '../../types/dto/bill-comparison.dto.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';

/**
 * Service for formatting and displaying budget information
 */
export class BudgetDisplayService {
    private static readonly PROGRESS_BAR_WIDTH = 20;
    private static readonly NAME_COLUMN_WIDTH = 25;
    private static readonly SPENT_COLUMN_WIDTH = 14;
    private static readonly PERCENTAGE_COLUMN_WIDTH = 8;

    constructor(private baseTransactionDisplayService: BaseTransactionDisplayService) {}

    /**
     * Formats the budget report header
     */
    formatHeader(
        month: number,
        year: number,
        daysLeft?: number,
        percentageLeft?: number,
        lastUpdatedOn?: Date
    ): string {
        const header = [
            '\n' +
                chalk.bold('Budget Report') +
                chalk.gray(
                    ` - ${new Date(year, month - 1).toLocaleString('default', {
                        month: 'long',
                    })} ${year}`
                ),
        ];

        if (daysLeft !== undefined && percentageLeft !== undefined && lastUpdatedOn) {
            header.push(
                chalk.gray(
                    `${daysLeft} days remaining (${percentageLeft.toFixed(1)}% of month left)`
                ),
                chalk.gray(`Last Updated: ${lastUpdatedOn.toISOString().split('T')[0]}\n`)
            );
        } else {
            header.push('');
        }

        return header.join('\n');
    }

    /**
     * Formats an individual budget item with clean spacing
     */
    formatBudgetItem(
        report: BudgetReport,
        isCurrentMonth: boolean,
        currentDay?: number,
        totalDays?: number
    ): string {
        const percentage = this.getPercentageSpent(report.spent, report.amount);
        const color = this.getColorForPercentage(
            percentage,
            isCurrentMonth ? 100 - (currentDay! / totalDays!) * 100 : undefined
        );

        const remaining = report.amount + report.spent;
        const progressBar = this.createProgressBar(percentage, report.spent, report.amount);

        const dailyRateInfo =
            isCurrentMonth && currentDay && totalDays
                ? this.getDailyRateIndicator(report.spent, report.amount, currentDay, totalDays)
                : '';

        // Format remaining with color based on overspent status
        const remainingColor = remaining < 0 ? chalk.red : chalk.gray;
        const remainingLabel = remaining < 0 ? 'Overspent' : 'Remaining';
        const remainingText = `${remainingLabel}: ${this.formatCurrency(remaining)}`;

        // Build manual formatting for clean, compact spacing
        const spentStr = color(this.formatCurrency(Math.abs(report.spent)));
        const budgetStr = chalk.bold(this.formatCurrency(report.amount));
        const percentStr = color(`(${percentage.toFixed(1)}%)`);

        const lines: string[] = [];
        lines.push(
            chalk.bold(report.name.padEnd(BudgetDisplayService.NAME_COLUMN_WIDTH)) +
                spentStr.padStart(BudgetDisplayService.SPENT_COLUMN_WIDTH) +
                ' of '.padStart(5) +
                budgetStr.padStart(BudgetDisplayService.SPENT_COLUMN_WIDTH) +
                '  ' +
                percentStr.padStart(BudgetDisplayService.PERCENTAGE_COLUMN_WIDTH) +
                '  ' +
                color(progressBar) +
                (dailyRateInfo ? '  ' + dailyRateInfo : '')
        );

        lines.push(
            ' '.repeat(BudgetDisplayService.NAME_COLUMN_WIDTH) + remainingColor(remainingText)
        );

        // Add projected spending if available
        const projectedSpendingInfo =
            isCurrentMonth && currentDay && totalDays
                ? this.formatProjectedSpending(report.spent, report.amount, currentDay, totalDays)
                : '';

        if (projectedSpendingInfo) {
            lines.push(' '.repeat(BudgetDisplayService.NAME_COLUMN_WIDTH) + projectedSpendingInfo);
        }

        // Add historical comparison if available
        const historicalComparisonInfo = this.formatHistoricalComparison(
            report.spent,
            report.historicalComparison
        );

        if (historicalComparisonInfo) {
            lines.push(
                ' '.repeat(BudgetDisplayService.NAME_COLUMN_WIDTH) + historicalComparisonInfo
            );
        }

        return lines.join('\n');
    }

    /**
     * Formats the budget summary
     */
    formatSummary(
        totalSpent: number,
        totalBudget: number,
        isCurrentMonth: boolean,
        currentDay?: number,
        totalDays?: number
    ): string {
        const totalPercentage = this.getPercentageSpent(totalSpent, totalBudget);
        const summaryColor = this.getColorForPercentage(
            totalPercentage,
            isCurrentMonth ? 100 - (currentDay! / totalDays!) * 100 : undefined
        );

        const progressBar = this.createProgressBar(totalPercentage, totalSpent, totalBudget);

        // Add total row
        const remaining = totalBudget + totalSpent;
        const remainingColor = remaining < 0 ? chalk.red : chalk.gray;
        const remainingLabel = remaining < 0 ? 'Overspent' : 'Remaining';
        const remainingText = `${remainingLabel}: ${this.formatCurrency(remaining)}`;

        // Build manual formatting for clean, compact spacing
        const spentStr = summaryColor(this.formatCurrency(Math.abs(totalSpent)));
        const budgetStr = chalk.bold(this.formatCurrency(totalBudget));
        const percentStr = summaryColor(`(${totalPercentage.toFixed(1)}%)`);

        const lines: string[] = [];
        lines.push(
            chalk.bold('TOTAL'.padEnd(BudgetDisplayService.NAME_COLUMN_WIDTH)) +
                spentStr.padStart(BudgetDisplayService.SPENT_COLUMN_WIDTH) +
                ' of '.padStart(5) +
                budgetStr.padStart(BudgetDisplayService.SPENT_COLUMN_WIDTH) +
                '  ' +
                percentStr.padStart(BudgetDisplayService.PERCENTAGE_COLUMN_WIDTH) +
                '  ' +
                summaryColor(progressBar)
        );

        lines.push(
            ' '.repeat(BudgetDisplayService.NAME_COLUMN_WIDTH) + remainingColor(remainingText)
        );

        return lines.join('\n');
    }

    /**
     * Gets a warning message if spending rate is too high
     * @param totalPercentage The percentage of budget spent
     * @param percentageLeft The percentage of time left in the month
     * @returns Warning message if spend rate is too high, null otherwise
     */
    getSpendRateWarning(totalPercentage: number, percentageLeft: number): string | null {
        // If we've spent more of our budget (as a percentage) than the percentage of month that has passed
        if (totalPercentage > ((100 - percentageLeft) / 100) * 100) {
            return chalk.yellow(
                '\nWarning: Current spend rate is higher than ideal for this point in the month.'
            );
        }
        return null;
    }

    getUnbudgetedExpenseWarning(total: number): string | null {
        if (total > 0) {
            return chalk.yellow(`\nWarning: ${total} untracked expense(s).`);
        }
        return null;
    }

    listUnbudgetedTransactions(transactions: TransactionSplit[]): string {
        return this.baseTransactionDisplayService.listTransactionsWithHeader(
            transactions,
            '=== Unbudgeted Transactions ==='
        );
    }

    /**
     * Formats the bill comparison section
     * @param comparison The bill comparison data
     * @param verbose If true, shows individual bill details
     */
    formatBillComparisonSection(comparison: BillComparisonDto, verbose?: boolean): string {
        if (comparison.bills.length === 0) {
            return chalk.gray('\n=== Bill Comparison ===\nNo bills configured.');
        }

        const output: string[] = [];
        output.push('\n' + chalk.bold('=== Bill Comparison ==='));

        // Format predicted total for this month
        const predicted = this.formatCurrencyWithSymbol(
            comparison.predictedTotal,
            comparison.currencySymbol
        );
        output.push(chalk.gray(`Predicted This Month:  ${chalk.white(predicted)}`));

        // Format actual total for this month
        const actual = this.formatCurrencyWithSymbol(
            comparison.actualTotal,
            comparison.currencySymbol
        );
        output.push(chalk.gray(`Actual This Month:     ${chalk.white(actual)}`));

        // Format variance with color
        const variance = this.formatCurrencyWithSymbol(
            Math.abs(comparison.variance),
            comparison.currencySymbol
        );
        const varianceColor = comparison.variance > 0 ? chalk.red : chalk.green;
        const varianceLabel = comparison.variance > 0 ? 'Over' : 'Under';
        output.push(
            chalk.gray(`Variance:              `) + varianceColor(`${varianceLabel} ${variance}`)
        );

        // Add individual bill details only if verbose flag is enabled
        if (verbose) {
            const billsWithActuals = comparison.bills.filter(b => b.actual > 0);
            if (billsWithActuals.length > 0) {
                output.push('\n' + chalk.gray('Bill Details:'));
                for (const bill of billsWithActuals) {
                    const billPredicted = this.formatCurrencyWithSymbol(
                        bill.predicted,
                        comparison.currencySymbol
                    );
                    const billActual = this.formatCurrencyWithSymbol(
                        bill.actual,
                        comparison.currencySymbol
                    );
                    output.push(
                        chalk.gray(`  ${bill.name}: `) +
                            chalk.white(`${billActual}`) +
                            chalk.gray(` (predicted: ${billPredicted})`)
                    );
                }
            }
        }

        return output.join('\n');
    }

    /**
     * Formats transaction list for a budget in verbose mode
     * Transactions should be pre-sorted by amount (highest first)
     * @param transactions Sorted list of transactions
     * @param budgetName Name of the budget
     * @returns Formatted transaction listing with header
     */
    formatBudgetTransactions(transactions: TransactionSplit[], budgetName: string): string {
        if (transactions.length === 0) {
            return '';
        }

        const lines = [chalk.cyanBright(`  Transactions for ${budgetName}:`)];

        transactions.forEach(transaction => {
            const transactionId = transaction.transaction_journal_id;
            if (transactionId) {
                lines.push(
                    this.baseTransactionDisplayService.formatBudgetTransaction(
                        transaction,
                        transactionId
                    )
                );
            }
        });

        return lines.join('\n');
    }

    /**
     * Formats transaction list with statistics for a budget in verbose mode
     * @param transactions Sorted list of transactions
     * @param budgetName Name of the budget
     * @param stats Optional transaction statistics
     * @returns Formatted transaction listing with header and stats
     */
    formatBudgetTransactionsWithStats(
        transactions: TransactionSplit[],
        budgetName: string,
        stats?: TransactionStats
    ): string {
        if (transactions.length === 0) {
            return '';
        }

        const lines = [];

        // Header with statistics
        if (stats) {
            const countText = `${stats.count} transaction${stats.count !== 1 ? 's' : ''}`;
            const avgText = `avg: ${this.formatCurrency(stats.average)}`;
            lines.push(chalk.dim(`  Transactions for ${budgetName} (${countText}, ${avgText}):`));
        } else {
            lines.push(chalk.dim(`  Transactions for ${budgetName}:`));
        }

        // Individual transactions
        transactions.forEach(transaction => {
            const transactionId = transaction.transaction_journal_id;
            if (transactionId) {
                lines.push(
                    this.baseTransactionDisplayService.formatBudgetTransaction(
                        transaction,
                        transactionId
                    )
                );
            }
        });

        // Merchant insights
        if (stats?.topMerchant) {
            lines.push('');
            const merchantText =
                chalk.dim('    Top Merchant: ') +
                chalk.white(stats.topMerchant.name) +
                chalk.dim(
                    ` (${this.formatCurrency(stats.topMerchant.totalSpent)}, ${stats.topMerchant.visitCount} visit${stats.topMerchant.visitCount !== 1 ? 's' : ''})`
                );
            lines.push(merchantText);
        }

        // Spending trend
        if (stats?.spendingTrend) {
            const trend = stats.spendingTrend;
            const diffFormatted = this.formatCurrency(Math.abs(trend.difference));
            const percFormatted = trend.percentageChange.toFixed(1);

            let trendText = '';
            if (trend.direction === 'increasing') {
                trendText = chalk.red(`↑ Increasing (+${diffFormatted}, +${percFormatted}%)`);
            } else if (trend.direction === 'decreasing') {
                trendText = chalk.green(`↓ Decreasing (-${diffFormatted}, ${percFormatted}%)`);
            } else {
                trendText = chalk.gray(`→ Stable (${diffFormatted}, ${percFormatted}%)`);
            }

            lines.push(chalk.dim('    Spending vs Last Month: ') + trendText);
        }

        return lines.join('\n');
    }

    private formatCurrencyWithSymbol(amount: number, symbol: string): string {
        return DisplayFormatterUtils.formatCurrency(amount, symbol);
    }

    private getDailyRateIndicator(
        spent: number,
        amount: number,
        currentDay: number,
        totalDays: number
    ): string {
        const idealSpentByNow = (amount / totalDays) * currentDay;
        const actualSpent = Math.abs(spent);
        const difference = actualSpent - idealSpentByNow;

        if (Math.abs(difference) < 1) {
            return chalk.gray('•');
        }

        const differenceFormatted = this.formatCurrency(Math.abs(difference));
        if (difference > 0) {
            return chalk.redBright(`↓${differenceFormatted}`);
        } else {
            return chalk.cyanBright(`↑${differenceFormatted}`);
        }
    }

    private formatProjectedSpending(
        spent: number,
        amount: number,
        currentDay: number,
        totalDays: number
    ): string {
        const actualSpent = Math.abs(spent);
        const dailyRate = actualSpent / currentDay;
        const projected = dailyRate * totalDays;
        const difference = projected - amount;

        const dailyRateFormatted = this.formatCurrency(dailyRate);
        const projectedFormatted = this.formatCurrency(projected);
        const differenceFormatted = this.formatCurrency(Math.abs(difference));

        let statusText = '';
        if (Math.abs(difference) < 1) {
            statusText = chalk.green('On track');
        } else if (difference > 0) {
            statusText = chalk.red(`Over by ${differenceFormatted}`);
        } else {
            statusText = chalk.cyan(`Under by ${differenceFormatted}`);
        }

        return (
            chalk.dim(`                 Pace: ${dailyRateFormatted}/day → Projected: `) +
            chalk.white(projectedFormatted) +
            ' ' +
            statusText
        );
    }

    private formatHistoricalComparison(
        spent: number,
        historical?: HistoricalComparisonDto
    ): string {
        if (!historical) {
            return '';
        }

        const currentSpent = Math.abs(spent);
        const previousSpent = Math.abs(historical.previousMonthSpent);
        const difference = currentSpent - previousSpent;
        const percentageChange = previousSpent > 0 ? (difference / previousSpent) * 100 : 0;

        const diffFormatted = this.formatCurrency(Math.abs(difference));
        const prevFormatted = this.formatCurrency(previousSpent);

        let indicator = '';
        if (Math.abs(difference) < 1) {
            indicator = chalk.gray('→ No change');
        } else if (difference > 0) {
            indicator = chalk.red(`↑${diffFormatted}, +${percentageChange.toFixed(1)}%`);
        } else {
            indicator = chalk.cyan(`↓${diffFormatted}, ${percentageChange.toFixed(1)}%`);
        }

        return chalk.dim(`                 vs Last Month: ${prevFormatted} `) + indicator;
    }

    private createProgressBar(percentage: number, spent?: number, amount?: number): string {
        const normalizedPercentage = Math.min(percentage, 100);
        const filledWidth = Math.round(
            (normalizedPercentage / 100) * BudgetDisplayService.PROGRESS_BAR_WIDTH
        );
        const emptyWidth = Math.max(0, BudgetDisplayService.PROGRESS_BAR_WIDTH - filledWidth);

        const bar = '█'.repeat(filledWidth) + ' '.repeat(emptyWidth);

        if (percentage > 100 && spent !== undefined && amount !== undefined) {
            const overAmount = Math.abs(spent) - amount;
            const overFormatted = this.formatCurrency(overAmount);
            return chalk.redBright(`[${bar}>>>] ${overFormatted} OVER`);
        }

        return `[${bar}]`;
    }

    private formatCurrency(amount: number): string {
        return CurrencyUtils.format(amount, 'USD', 'en-US');
    }

    private getPercentageSpent(spent: number, amount: number): number {
        const percentage = Math.abs(spent) / amount;
        return percentage ? percentage * 100 : 0;
    }

    private getColorForPercentage(percentage: number, daysLeftPercentage?: number): ChalkInstance {
        if (daysLeftPercentage !== undefined) {
            if (percentage > daysLeftPercentage) {
                return percentage > 100 ? chalk.red : chalk.yellow;
            }
        }

        if (percentage > 100) return chalk.red;
        if (percentage > 85) return chalk.yellow;
        return chalk.green;
    }
}
