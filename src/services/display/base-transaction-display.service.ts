import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { TransactionClassificationService } from '../core/transaction-classification.service.js';
import { TransactionUtils } from '../../utils/transaction.utils.js';

export class BaseTransactionDisplayService {
    private readonly transactionUtils: TransactionUtils;

    constructor(
        private readonly transactionClassificationService: TransactionClassificationService,
        private readonly baseUrl: string = '',
        transactionUtils: TransactionUtils = new TransactionUtils()
    ) {
        this.transactionUtils = transactionUtils;
    }

    listTransactionsWithHeader(transactions: TransactionSplit[], description: string) {
        const lines = [chalk.bold(`\n${description}\n`)];

        if (transactions.length === 0) {
            lines.push(chalk.dim('No transactions found'));
        } else {
            const totalExpenses = this.transactionUtils.calculateTotal(transactions);
            transactions.forEach(transaction => {
                lines.push(this.formatTransaction(transaction));
            });
            lines.push(
                chalk.yellow.bold(
                    `Total Expenses: ${transactions[0]?.currency_symbol}${totalExpenses.toFixed(2)}`
                )
            );
        }

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

    /**
     * Formats a transaction for budget verbose listing with clickable link
     * Truncates description at 60 characters with ellipsis
     * @param transaction Transaction split to format
     * @param transactionId Transaction ID for linking
     * @returns Formatted transaction line
     */
    formatBudgetTransaction(transaction: TransactionSplit, transactionId: string): string {
        const amount = parseFloat(transaction.amount);
        const date = new Date(transaction.date).toLocaleDateString();
        const amountStr = `${transaction.currency_symbol}${Math.abs(amount).toFixed(2)}`;

        // Truncate description at 60 characters
        const MAX_LENGTH = 60;
        const truncated =
            transaction.description.length > MAX_LENGTH
                ? transaction.description.substring(0, 57) + '...'
                : transaction.description;

        // Create ANSI hyperlink for entire description
        const link = `${this.baseUrl}/transactions/show/${transactionId}`;
        const clickableDescription = `\x1B]8;;${link}\x1B\\${truncated}\x1B]8;;\x1B\\`;

        return `  ${chalk.yellow(amountStr.padStart(12))}  ${chalk.white(clickableDescription)}  ${chalk.dim(date)}`;
    }

    private getTransactionTypeIndicator(transaction: TransactionSplit): string {
        if (this.transactionClassificationService.isBill(transaction)) {
            return chalk.redBright('[BILL]');
        } else if (this.transactionClassificationService.isTransfer(transaction)) {
            return chalk.yellowBright('[TRANSFER]');
        } else if (this.transactionClassificationService.isDeposit(transaction)) {
            return chalk.greenBright('[DEPOSIT]');
        }
        return chalk.gray('[OTHER]');
    }
}
