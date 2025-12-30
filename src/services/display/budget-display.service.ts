import chalk, { ChalkInstance } from 'chalk';
import { BudgetReportDto as BudgetReport } from '../../types/dto/budget-report.dto.js';
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
     * Formats an individual budget item
     */
    formatBudgetItem(
        report: BudgetReport,
        nameWidth: number,
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
        const progressBar = this.createProgressBar(percentage);

        const dailyRateInfo =
            isCurrentMonth && currentDay && totalDays
                ? this.getDailyRateIndicator(report.spent, report.amount, currentDay, totalDays)
                : '';

        return (
            chalk.bold(report.name.padEnd(nameWidth)) +
            color(this.formatCurrency(Math.abs(report.spent)).padStart(12)) +
            ' of ' +
            chalk.bold(this.formatCurrency(report.amount).padStart(12)) +
            color(` (${percentage.toFixed(1)}%)`.padStart(8)) +
            '  ' +
            color(progressBar) +
            (dailyRateInfo ? ' ' + dailyRateInfo : '') +
            '\n' +
            ' '.repeat(nameWidth) +
            chalk.gray(`Remaining: ${this.formatCurrency(remaining)}`)
        );
    }

    /**
     * Formats the budget summary
     */
    formatSummary(
        totalSpent: number,
        totalBudget: number,
        nameWidth: number,
        isCurrentMonth: boolean,
        currentDay?: number,
        totalDays?: number
    ): string {
        const totalPercentage = this.getPercentageSpent(totalSpent, totalBudget);
        const summaryColor = this.getColorForPercentage(
            totalPercentage,
            isCurrentMonth ? 100 - (currentDay! / totalDays!) * 100 : undefined
        );

        const totalDailyRateInfo =
            isCurrentMonth && currentDay && totalDays
                ? this.getDailyRateIndicator(totalSpent, totalBudget, currentDay, totalDays)
                : '';

        return (
            chalk.bold('TOTAL'.padEnd(nameWidth)) +
            summaryColor(this.formatCurrency(Math.abs(totalSpent)).padStart(12)) +
            ' of ' +
            chalk.bold(this.formatCurrency(totalBudget).padStart(12)) +
            summaryColor(` (${totalPercentage.toFixed(1)}%)`.padStart(8)) +
            '  ' +
            summaryColor(this.createProgressBar(totalPercentage)) +
            (totalDailyRateInfo ? ' ' + totalDailyRateInfo : '')
        );
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

        const lines = [chalk.dim(`  Transactions for ${budgetName}:`)];

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

    private createProgressBar(percentage: number): string {
        const normalizedPercentage = Math.min(percentage, 100);
        const filledWidth = Math.round(
            (normalizedPercentage / 100) * BudgetDisplayService.PROGRESS_BAR_WIDTH
        );
        const emptyWidth = Math.max(0, BudgetDisplayService.PROGRESS_BAR_WIDTH - filledWidth);

        const bar = '█'.repeat(filledWidth) + ' '.repeat(emptyWidth);
        return percentage > 100 ? `[${bar}] +${(percentage - 100).toFixed(0)}%` : `[${bar}]`;
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
