import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { Command } from '../types/interface/command.interface.js';
import { TransactionSplitService, SplitData } from '../services/transaction-split.service.js';
import { SplitTransactionDisplayService } from '../services/display/split-transaction-display.service.js';
import { UserInputService } from '../services/user-input.service.js';
import { parseSplitAmount, remainderAmount } from '../utils/split-amount.utils.js';
import { DEFAULT_CURRENCY } from '../utils/currency.utils.js';

/**
 * Parameters for split transaction command
 */
interface SplitTransactionParams {
    transactionId: string;
    amount?: string;
    descriptions?: string[];
    yes?: boolean;
}

/**
 * Command for splitting a transaction into two parts
 */
export class SplitTransactionCommand implements Command<void, SplitTransactionParams> {
    constructor(
        private readonly splitService: TransactionSplitService,
        private readonly displayService: SplitTransactionDisplayService,
        private readonly userInputService: UserInputService
    ) {}

    /**
     * @throws when the transaction cannot be fetched or split; the spinner is
     *   marked failed, and printing the error is left to the caller
     */
    async execute(params: SplitTransactionParams): Promise<void> {
        const { transactionId, amount, descriptions, yes } = params;

        // Extract individual descriptions from array (supports n-way splits in future)
        const description1 = descriptions?.[0];
        const description2 = descriptions?.[1];

        console.log(this.displayService.formatHeader(transactionId));

        const spinner = ora('Fetching transaction...').start();
        const originalSplit = await failSpinnerOnError(spinner, 'Failed to fetch transaction', () =>
            this.splitService.getSingleSplit(transactionId)
        );
        const originalAmount = parseFloat(originalSplit.amount);

        spinner.succeed('Transaction fetched');

        // Display original transaction
        console.log(this.displayService.formatOriginalTransaction(originalSplit, transactionId));

        const currencySymbol = originalSplit.currency_symbol || DEFAULT_CURRENCY.symbol;

        // Get split amount: use CLI parameter if provided, otherwise prompt
        const firstSplitAmount = amount
            ? parseSplitAmount(amount, originalAmount, currencySymbol)
            : await this.userInputService.getSplitAmount(originalAmount, currencySymbol);

        const secondSplitAmount = remainderAmount(originalAmount, firstSplitAmount);

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
                firstSplitData.description,
                secondSplitData.amount,
                secondSplitData.description,
                currencySymbol
            )
        );

        // Confirm with user: skip if --yes flag provided
        const confirmed = yes || (await this.userInputService.confirmSplit());

        if (!confirmed) {
            console.log(chalk.yellow('\nSplit cancelled.'));
            return;
        }

        spinner.start('Splitting transaction...');
        const updated = await failSpinnerOnError(spinner, 'Failed to split transaction', () =>
            this.splitService.splitTransaction(transactionId, originalSplit, [
                firstSplitData,
                secondSplitData,
            ])
        );
        spinner.succeed('Transaction split successfully');
        console.log(
            this.displayService.formatSuccess(transactionId, updated.attributes.transactions.length)
        );
    }
}

/**
 * Runs `work`, marking the spinner failed if it throws. The error itself is
 * rethrown for the CLI to print once.
 */
async function failSpinnerOnError<T>(
    spinner: Ora,
    failureText: string,
    work: () => Promise<T>
): Promise<T> {
    try {
        return await work();
    } catch (error) {
        spinner.fail(failureText);
        throw error;
    }
}
