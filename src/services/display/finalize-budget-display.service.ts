import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { TransactionPropertyService } from '../core/transaction-property.service';

/**
 * Interface for transaction counts
 */
export interface TransactionCounts {
    bills: number;
    transfers: number;
    deposits: number;
    other: number;
}

/**
 * Service for formatting and displaying finalize budget information
 */
export class FinalizeBudgetDisplayService {
    constructor(private readonly transactionPropertyService: TransactionPropertyService) {}

    /**
     * Formats the header box
     */
    formatHeader(text: string): string {
        const padding = 2;
        const textLength = text.length;
        const totalLength = textLength + padding * 2;

        const topBorder = '╔' + '═'.repeat(totalLength) + '╗';
        const middleLine = '║' + ' '.repeat(padding) + text + ' '.repeat(padding) + '║';
        const bottomBorder = '╚' + '═'.repeat(totalLength) + '╝';

        return `\n${chalk.cyan(topBorder)}\n${chalk.cyan(middleLine)}\n${chalk.cyan(bottomBorder)}`;
    }

    /**
     * Formats the month header
     */
    formatMonthHeader(month: number, year: number): string {
        const monthName = Intl.DateTimeFormat('en', { month: 'long' }).format(
            new Date(year, month - 1)
        );
        return chalk.cyan(`\nBudget Report for ${monthName} ${year}`);
    }

    /**
     * Formats the additional income section
     */
    formatAdditionalIncomeSection(transactions: TransactionSplit[]): string {
        const lines = [chalk.bold('\n=== Additional Income ===\n')];

        if (transactions.length === 0) {
            lines.push(chalk.dim('No additional income transactions found'));
        } else {
            const totalIncome = this.calculateTotal(transactions);
            transactions.forEach(transaction => {
                lines.push(this.formatTransaction(transaction));
            });
            lines.push(
                chalk.cyan.bold(
                    `Total Additional Income: ${
                        transactions[0]?.currency_symbol
                    }${totalIncome.toFixed(2)}`
                )
            );
        }

        return lines.join('\n');
    }

    /**
     * Formats the unbudgeted expenses section
     */
    formatUnbudgetedExpensesSection(transactions: TransactionSplit[]): string {
        const lines = [chalk.bold('\n=== Unbudgeted Expenses ===\n')];

        if (transactions.length === 0) {
            lines.push(chalk.dim('No unbudgeted expense transactions found'));
        } else {
            const totalExpenses = this.calculateTotal(transactions);
            transactions.forEach(transaction => {
                lines.push(this.formatTransaction(transaction));
            });
            lines.push(
                chalk.yellow.bold(
                    `Total Unbudgeted Expenses: ${
                        transactions[0]?.currency_symbol
                    }${totalExpenses.toFixed(2)}`
                )
            );
        }

        return lines.join('\n');
    }

    /**
     * Formats the summary section with enhanced visuals
     */
    formatSummary(
        counts: TransactionCounts,
        additionalIncome: TransactionSplit[],
        unbudgetedExpenses: TransactionSplit[],
        paycheckSurplus: number
    ): string {
        const currencySymbol =
            additionalIncome[0]?.currency_symbol || unbudgetedExpenses[0]?.currency_symbol || '$';

        const totalIncome = this.calculateTotal(additionalIncome);
        const totalExpenses = this.calculateTotal(unbudgetedExpenses);

        const lines = [
            chalk.bold('\n=== Transaction Summary ==='),
            '',
            '📋 Transaction Types:',
            `  ${chalk.redBright('💳 Bills:')}\t\t${counts.bills}`,
            `  ${chalk.cyan('↔️  Transfers:')}\t${counts.transfers}`,
            `  ${chalk.greenBright('💰 Deposits:')}\t${counts.deposits}`,
            `  ${chalk.gray('❓ Other:')}\t\t${counts.other}`,
            '',
            '💵 Financial Totals:',
            `  Additional Income:     ${this.formatAmount(totalIncome, currencySymbol, 'positive')}`,
            `  Unbudgeted Expenses:   ${this.formatAmount(totalExpenses, currencySymbol, 'negative')}`,
            `  Paycheck Variance:     ${this.formatAmount(paycheckSurplus, currencySymbol, paycheckSurplus >= 0 ? 'positive' : 'negative')}`,
        ];

        return lines.join('\n');
    }

    private formatTransaction(transaction: TransactionSplit): string {
        const type = this.getTransactionTypeIndicator(transaction);
        const amount = parseFloat(transaction.amount);
        const date = new Date(transaction.date).toLocaleDateString();
        const amountStr = `${transaction.currency_symbol}${Math.abs(amount).toFixed(2)}`;

        const lines = [
            `${type} ${chalk.white(transaction.description)}`,
            chalk.dim(`    Date: ${date}`).padEnd(35) + chalk.yellow(`Amount: ${amountStr}`),
        ];

        if (transaction.category_name) {
            lines.push(chalk.dim(`    Category: ${transaction.category_name}`));
        }

        lines.push(''); // Add extra spacing between transactions
        return lines.join('\n');
    }

    private getTransactionTypeIndicator(transaction: TransactionSplit): string {
        if (this.transactionPropertyService.isBill(transaction)) {
            return chalk.redBright('[BILL]');
        } else if (this.transactionPropertyService.isTransfer(transaction)) {
            return chalk.yellowBright('[TRANSFER]');
        } else if (this.transactionPropertyService.isDeposit(transaction)) {
            return chalk.greenBright('[DEPOSIT]');
        }
        return chalk.gray('[OTHER]');
    }

    /**
     * Formats actionable recommendations
     */
    formatActionableRecommendations(
        additionalIncome: TransactionSplit[],
        unbudgetedExpenses: TransactionSplit[],
        paycheckSurplus: number,
        netImpact: number
    ): string {
        const lines = [chalk.bold('\n=== Recommendations ==='), ''];

        // Positive net impact recommendations
        if (netImpact > 500) {
            lines.push(
                `✅ ${chalk.green('Strong Position:')} Consider allocating surplus to:`,
                `   • Emergency fund or high-yield savings`,
                `   • Investment contributions`,
                `   • Debt reduction`,
                ''
            );
        }
        // Negative net impact recommendations
        else if (netImpact < -200) {
            lines.push(
                `🔴 ${chalk.red('Action Needed:')} Address spending gap by:`,
                `   • Reviewing and reducing unbudgeted expenses`,
                `   • Adjusting monthly budget categories`,
                `   • Identifying recurring expenses to budget for`,
                ''
            );
        }
        // Neutral recommendations
        else {
            lines.push(
                `📊 ${chalk.blue('Balanced Month:')} Maintain current approach:`,
                `   • Monitor recurring unbudgeted expenses`,
                `   • Consider adding buffer to monthly budget`,
                ''
            );
        }

        // Subscription management recommendation
        const subscriptionExpenses = unbudgetedExpenses.filter(
            expense =>
                expense.description.toLowerCase().includes('subscription') ||
                expense.description.toLowerCase().includes('spotify') ||
                expense.description.toLowerCase().includes('netflix') ||
                expense.description.toLowerCase().includes('patreon')
        );

        if (subscriptionExpenses.length > 2) {
            lines.push(
                `💡 ${chalk.yellow('Subscription Review:')} Found ${subscriptionExpenses.length} subscription charges`,
                `   • Review active subscriptions for unused services`,
                `   • Add regular subscriptions to monthly budget`,
                ''
            );
        }

        return lines.join('\n');
    }

    /**
     * Helper method to format amounts with appropriate colors
     */
    private formatAmount(
        amount: number,
        currencySymbol: string,
        type: 'positive' | 'negative' | 'neutral' = 'neutral'
    ): string {
        const formattedAmount = `${currencySymbol}${Math.abs(amount).toFixed(2)}`;

        switch (type) {
            case 'positive':
                return amount >= 0
                    ? chalk.green(formattedAmount)
                    : chalk.red(`-${formattedAmount}`);
            case 'negative':
                return amount >= 0
                    ? chalk.red(formattedAmount)
                    : chalk.green(`-${formattedAmount}`);
            default:
                return chalk.white(formattedAmount);
        }
    }

    private calculateTotal(transactions: TransactionSplit[]): number {
        return transactions.reduce((sum, transaction) => sum + parseFloat(transaction.amount), 0);
    }
}
