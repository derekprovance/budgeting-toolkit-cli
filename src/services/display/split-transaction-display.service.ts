import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { SplitParts } from '../transaction-split.service.js';

export class SplitTransactionDisplayService {
    constructor(private readonly baseUrl: string) {}

    formatOriginalTransaction(transaction: TransactionSplit, transactionId: string): string {
        const lines = [
            chalk.bold('\nOriginal Transaction:'),
            DisplayFormatterUtils.createHorizontalLine(),
            `${chalk.bold('Description:')} ${transaction.description}`,
            `${chalk.bold('Amount:')} ${transaction.currency_symbol}${transaction.amount}`,
            `${chalk.bold('Date:')} ${transaction.date}`,
        ];

        if (transaction.category_name) {
            lines.push(`${chalk.bold('Category:')} ${transaction.category_name}`);
        }

        if (transaction.budget_name) {
            lines.push(`${chalk.bold('Budget:')} ${transaction.budget_name}`);
        }

        if (transaction.source_name) {
            lines.push(`${chalk.bold('Source:')} ${transaction.source_name}`);
        }

        if (transaction.destination_name) {
            lines.push(`${chalk.bold('Destination:')} ${transaction.destination_name}`);
        }

        lines.push(`${chalk.bold('Link:')} ${this.getTransactionLink(transactionId)}`);
        lines.push(DisplayFormatterUtils.createHorizontalLine());

        return lines.join('\n');
    }

    /** @param parentDescription the parent transaction's group_title */
    formatSplitPreview(
        parentDescription: string,
        [first, second]: SplitParts,
        currencySymbol: string
    ): string {
        const lines = [
            chalk.bold('\nSplit Preview:'),
            DisplayFormatterUtils.createHorizontalLine(),
            chalk.yellow.bold(`\nParent Transaction: "${parentDescription}"`),
            chalk.cyan.bold('\nSplit 1:'),
            `  ${chalk.bold('Description:')} ${first.description}`,
            `  ${chalk.bold('Amount:')} ${currencySymbol}${first.amount}`,
            `  ${chalk.dim('(preserves category, budget, and tags from original)')}`,
            chalk.cyan.bold('\nSplit 2:'),
            `  ${chalk.bold('Description:')} ${second.description}`,
            `  ${chalk.bold('Amount:')} ${currencySymbol}${second.amount}`,
            `  ${chalk.dim('(category and budget left unset for manual assignment)')}`,
            DisplayFormatterUtils.createHorizontalLine(),
        ];

        return lines.join('\n');
    }

    formatSuccess(transactionId: string, splitCount: number): string {
        return [
            `Created ${splitCount} splits from original transaction.`,
            `View at: ${this.getTransactionLink(transactionId)}`,
        ].join('\n');
    }

    formatHeader(transactionId: string): string {
        return [
            chalk.bold('\n' + '='.repeat(60)),
            chalk.bold.cyan(`  Transaction Split Tool`),
            chalk.bold('='.repeat(60)),
            ``,
            `Transaction ID: ${transactionId}`,
        ].join('\n');
    }

    formatRemainder(amount: number, currencySymbol: string): string {
        return chalk.dim(
            `Remainder for second split: ${CurrencyUtils.formatWithSymbol(amount, currencySymbol)}`
        );
    }

    private getTransactionLink(transactionId: string): string {
        return DisplayFormatterUtils.transactionUrl(this.baseUrl, transactionId);
    }
}
