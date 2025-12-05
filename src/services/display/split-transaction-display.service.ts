import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';

/**
 * Service for formatting split transaction display output
 */
export class SplitTransactionDisplayService {
    constructor(private readonly baseUrl: string) {}

    /**
     * Formats the original transaction details for display
     * @param transaction The original transaction split data
     * @param transactionId The ID of the transaction
     * @returns Formatted string showing transaction details with link
     */
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

    /**
     * Formats the split preview showing parent transaction and both child splits before confirmation
     * @param parentDescription The parent transaction title (group_title)
     * @param split1Amount Amount for first split
     * @param split1Description Description for first split
     * @param split2Amount Amount for second split
     * @param split2Description Description for second split
     * @param currencySymbol Currency symbol to display
     * @returns Formatted preview showing parent and both child splits
     */
    formatSplitPreview(
        parentDescription: string,
        split1Amount: string,
        split1Description: string,
        split2Amount: string,
        split2Description: string,
        currencySymbol: string
    ): string {
        const lines = [
            chalk.bold('\nSplit Preview:'),
            DisplayFormatterUtils.createHorizontalLine(),
            chalk.yellow.bold(`\nParent Transaction: "${parentDescription}"`),
            chalk.cyan.bold('\nSplit 1:'),
            `  ${chalk.bold('Description:')} ${split1Description}`,
            `  ${chalk.bold('Amount:')} ${currencySymbol}${split1Amount}`,
            `  ${chalk.dim('(preserves category, budget, and tags from original)')}`,
            chalk.cyan.bold('\nSplit 2:'),
            `  ${chalk.bold('Description:')} ${split2Description}`,
            `  ${chalk.bold('Amount:')} ${currencySymbol}${split2Amount}`,
            `  ${chalk.dim('(category and budget left unset for manual assignment)')}`,
            DisplayFormatterUtils.createHorizontalLine(),
        ];

        return lines.join('\n');
    }

    /**
     * Formats success message after split operation
     * @param transactionId The ID of the split transaction
     * @param splitCount Number of splits created
     * @returns Formatted success message with link to view transaction
     */
    formatSuccess(transactionId: string, splitCount: number): string {
        return [
            `Created ${splitCount} splits from original transaction.`,
            `View at: ${this.getTransactionLink(transactionId)}`,
        ].join('\n');
    }

    /**
     * Formats error message for display
     * @param error The error that occurred
     * @returns Formatted error message
     */
    formatError(error: Error): string {
        return [
            chalk.red.bold('\n✗ Failed to split transaction'),
            ``,
            chalk.red(`Error: ${error.message}`),
        ].join('\n');
    }

    /**
     * Formats the header for split operation
     * @param transactionId The ID of the transaction being split
     * @returns Formatted header banner
     */
    formatHeader(transactionId: string): string {
        return [
            chalk.bold('\n' + '='.repeat(60)),
            chalk.bold.cyan(`  Transaction Split Tool`),
            chalk.bold('='.repeat(60)),
            ``,
            `Transaction ID: ${transactionId}`,
        ].join('\n');
    }

    /**
     * Formats amount input prompt
     * @param originalAmount The original transaction amount
     * @param currencySymbol Currency symbol to display
     * @returns Formatted prompt string
     */
    formatAmountPrompt(originalAmount: number, currencySymbol: string): string {
        return `Enter amount for first split (original: ${currencySymbol}${originalAmount}):`;
    }

    /**
     * Formats calculated remainder for display
     * @param amount The remainder amount for the second split
     * @param currencySymbol Currency symbol to display
     * @returns Formatted remainder message
     */
    formatRemainder(amount: number, currencySymbol: string): string {
        return chalk.dim(`Remainder for second split: ${currencySymbol}${amount.toFixed(2)}`);
    }

    /**
     * Formats validation error message
     * @param message The validation error message
     * @returns Formatted error string
     */
    formatValidationError(message: string): string {
        return chalk.red(`✗ ${message}`);
    }

    /**
     * Returns the transaction link
     */
    private getTransactionLink(transactionId: string): string {
        return `${this.baseUrl}/transactions/show/${transactionId}`;
    }
}
