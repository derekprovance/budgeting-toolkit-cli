import ora from 'ora';
import chalk from 'chalk';
import { Command } from '../types/interface/command.interface.js';
import { TransactionSplitService, SplitData } from '../services/transaction-split.service.js';
import { SplitTransactionDisplayService } from '../services/display/split-transaction-display.service.js';
import { UserInputService } from '../services/user-input.service.js';
import { logger } from '../logger.js';

/**
 * Parameters for split transaction command
 */
interface SplitTransactionParams {
    transactionId: string;
    amount?: string;
    description1?: string;
    description2?: string;
    yes?: boolean;
}

/**
 * Command for splitting a transaction into two parts
 */
export class SplitTransactionCommand implements Command<void, SplitTransactionParams> {
    /** Default currency symbol if transaction doesn't specify one */
    private static readonly DEFAULT_CURRENCY_SYMBOL = '$';

    constructor(
        private readonly splitService: TransactionSplitService,
        private readonly displayService: SplitTransactionDisplayService,
        private readonly userInputService: UserInputService
    ) {}

    async execute(params: SplitTransactionParams): Promise<void> {
        const { transactionId, amount, description1, description2, yes } = params;
        console.log(this.displayService.formatHeader(transactionId));

        const spinner = ora('Fetching transaction...').start();

        try {
            // Fetch the original transaction
            const transaction = await this.splitService.getTransaction(transactionId);

            if (!transaction) {
                spinner.fail(chalk.red(`Transaction ${transactionId} not found`));
                return;
            }
            const splits = transaction.attributes.transactions;

            if (!splits || splits.length === 0) {
                spinner.fail(chalk.red('Transaction has no splits'));
                return;
            }

            if (splits.length > 1) {
                spinner.fail(
                    chalk.red(
                        `Transaction already has ${splits.length} splits. Only single transactions can be split.`
                    )
                );
                return;
            }

            const originalSplit = splits[0];
            const originalAmount = parseFloat(originalSplit.amount);

            spinner.succeed('Transaction fetched');

            // Display original transaction
            console.log(
                this.displayService.formatOriginalTransaction(originalSplit, transactionId)
            );

            const currencySymbol =
                originalSplit.currency_symbol || SplitTransactionCommand.DEFAULT_CURRENCY_SYMBOL;

            // Get split amount: use CLI parameter if provided, otherwise prompt
            const firstSplitAmount = amount
                ? this.validateAndParseSplitAmount(amount, originalAmount, currencySymbol)
                : await this.userInputService.getSplitAmount(originalAmount, currencySymbol);

            // Use toFixed to avoid floating-point precision errors
            const secondSplitAmount = parseFloat((originalAmount - firstSplitAmount).toFixed(2));

            // Show remainder
            console.log(this.displayService.formatRemainder(secondSplitAmount, currencySymbol));

            // Get custom text for split 1: use CLI parameter if provided, otherwise prompt
            const firstCustomText =
                description1 !== undefined
                    ? description1
                    : await this.userInputService.getCustomSplitText(1);
            const firstDescription = firstCustomText
                ? `${originalSplit.description} ${firstCustomText}`
                : originalSplit.description;

            // Get custom text for split 2: use CLI parameter if provided, otherwise prompt
            const secondCustomText =
                description2 !== undefined
                    ? description2
                    : await this.userInputService.getCustomSplitText(2);
            const secondDescription = secondCustomText
                ? `${originalSplit.description} ${secondCustomText}`
                : originalSplit.description;

            // Prepare split data
            const firstSplitData: SplitData = {
                amount: firstSplitAmount.toFixed(2),
                description: firstDescription,
            };

            const secondSplitData: SplitData = {
                amount: secondSplitAmount.toFixed(2),
                description: secondDescription,
            };

            // Show preview with parent description
            console.log(
                this.displayService.formatSplitPreview(
                    originalSplit.description, // Parent transaction title
                    firstSplitData.amount,
                    firstSplitData.description || originalSplit.description,
                    secondSplitData.amount,
                    secondSplitData.description || originalSplit.description,
                    currencySymbol
                )
            );

            // Confirm with user: skip if --yes flag provided
            const confirmed = yes || (await this.userInputService.confirmSplit());

            if (!confirmed) {
                console.log(chalk.yellow('\nSplit cancelled.'));
                return;
            }

            // Execute the split
            spinner.start('Splitting transaction...');

            const result = await this.splitService.splitTransaction(
                transactionId,
                firstSplitData.amount,
                firstSplitData,
                secondSplitData
            );

            if (result.success && result.transaction) {
                spinner.succeed('Transaction split successfully');
                console.log(
                    this.displayService.formatSuccess(
                        transactionId,
                        result.transaction.attributes.transactions?.length || 2
                    )
                );
            } else {
                spinner.fail('Failed to split transaction');
                if (result.error) {
                    console.log(this.displayService.formatError(result.error));
                }
            }
        } catch (error) {
            spinner.fail('Failed to split transaction');
            const errorObject = error instanceof Error ? error : new Error('Unknown error');

            // Diagnostic logging for troubleshooting
            logger.error(
                {
                    error: errorObject.message,
                    stack: errorObject.stack,
                    transactionId,
                },
                'Split transaction command failed'
            );

            // User-facing output
            console.log(this.displayService.formatError(errorObject));

            // Exit with error code for CLI
            process.exit(1);
        }
    }

    /**
     * Validates and parses split amount from CLI parameter
     * @param amountStr Amount string from CLI parameter
     * @param originalAmount Original transaction amount
     * @param currencySymbol Currency symbol for error messages
     * @returns Parsed amount as number
     * @throws Error if validation fails
     */
    private validateAndParseSplitAmount(
        amountStr: string,
        originalAmount: number,
        currencySymbol: string
    ): number {
        // Validate format: must be a valid decimal number with max 2 decimal places
        if (!/^\d+(\.\d{1,2})?$/.test(amountStr.trim())) {
            throw new Error(
                'Amount must be a valid number with at most 2 decimal places (e.g., 10.50)'
            );
        }

        const amount = parseFloat(amountStr.trim());

        // Check for NaN (shouldn't happen with regex, but defensive)
        if (isNaN(amount)) {
            throw new Error('Amount must be a valid number');
        }

        // Check for negative (regex should prevent, but explicit check)
        if (amount < 0) {
            throw new Error('Amount cannot be negative');
        }

        // Check for zero
        if (amount === 0) {
            throw new Error('Amount must be greater than zero');
        }

        // Check if amount is less than minimum (1 cent)
        if (amount < 0.01) {
            throw new Error('Amount must be at least 0.01');
        }

        // Check if amount would leave nothing for second split
        if (amount >= originalAmount) {
            throw new Error(
                `Amount must be less than the original amount (${currencySymbol}${originalAmount})`
            );
        }

        // Validate minimum second split amount (at least 1 cent)
        const secondSplitAmount = parseFloat((originalAmount - amount).toFixed(2));
        if (secondSplitAmount < 0.01) {
            throw new Error(
                `Second split would be too small (${currencySymbol}${secondSplitAmount.toFixed(2)}). Please enter a smaller amount.`
            );
        }

        return amount;
    }
}
