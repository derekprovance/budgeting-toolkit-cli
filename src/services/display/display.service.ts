import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { TransactionPropertyService } from '../core/transaction-property.service';

export class DisplayService {
    constructor(private readonly transactionPropertyService: TransactionPropertyService) {}

    listTransactionsWithHeader(transactions: TransactionSplit[], description: string) {
        const lines = [chalk.bold(`\n${description}\n`)];

        if (transactions.length === 0) {
            lines.push(chalk.dim('No transactions found'));
        } else {
            const totalExpenses = this.calculateTotal(transactions);
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

    private calculateTotal(transactions: TransactionSplit[]): number {
        return transactions.reduce((sum, transaction) => sum + parseFloat(transaction.amount), 0);
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
}
