import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { ITransactionClassificationService } from '../core/transaction-classification.service.interface.js';
import { TransactionUtils } from '../../utils/transaction.utils.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';

export class BaseTransactionDisplayService {
    private readonly transactionUtils: TransactionUtils;

    constructor(
        private readonly transactionClassificationService: ITransactionClassificationService,
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
            const totalFormatted = CurrencyUtils.formatWithSymbol(
                totalExpenses,
                transactions[0]?.currency_symbol ?? ''
            );
            lines.push(chalk.yellow.bold(`Total Expenses: ${totalFormatted}`));
        }

        return lines.join('\n');
    }

    private formatTransaction(transaction: TransactionSplit): string {
        const type = this.getTransactionTypeIndicator(transaction);
        const amount = TransactionCalculationUtils.parseAmountSafe(transaction.amount);
        const date = new Date(transaction.date).toLocaleDateString();
        const amountStr = CurrencyUtils.formatWithSymbol(
            Math.abs(amount),
            transaction.currency_symbol ?? ''
        );

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
     * Truncates description at 60 characters without ellipsis
     * @param transaction Transaction split to format
     * @param transactionId Transaction ID for linking
     * @returns Formatted transaction line
     */
    formatBudgetTransaction(transaction: TransactionSplit, transactionId: string): string {
        const amount = TransactionCalculationUtils.parseAmountSafe(transaction.amount);
        const date = new Date(transaction.date).toLocaleDateString();
        const amountStr = CurrencyUtils.formatWithSymbol(
            Math.abs(amount),
            transaction.currency_symbol ?? ''
        );

        // Truncate description at 60 characters without ellipsis
        const truncated = transaction.description.substring(0, 60).padEnd(60);

        // Create ANSI hyperlink for entire description
        const link = this.baseUrl
            ? `${this.baseUrl}/transactions/show/${transactionId}`
            : undefined;
        const clickableDescription = DisplayFormatterUtils.createHyperlink(truncated, link);

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
