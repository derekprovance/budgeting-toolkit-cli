import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { Command } from '../types/interface/command.interface.js';
import { TransactionSplitService, SplitParts } from '../services/transaction-split.service.js';
import { SplitTransactionDisplayService } from '../services/display/split-transaction-display.service.js';
import { UserInputService } from '../services/user-input.service.js';
import {
    currencySymbolOf,
    parseSplitAmount,
    remainderAmount,
} from '../utils/split-amount.utils.js';

interface SplitTransactionParams {
    transactionId: string;
    amount?: string;
    descriptions?: string[];
    yes?: boolean;
}

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
        const { transactionId, yes } = params;

        console.log(this.displayService.formatHeader(transactionId));

        const originalSplit = await this.fetchOriginalSplit(transactionId);
        const parts = await this.resolveParts(originalSplit, params);

        console.log(
            this.displayService.formatSplitPreview(
                originalSplit.description,
                parts,
                currencySymbolOf(originalSplit)
            )
        );

        const confirmed = yes || (await this.userInputService.confirmSplit());
        if (!confirmed) {
            console.log(chalk.yellow('\nSplit cancelled.'));
            return;
        }

        await this.applySplit(transactionId, originalSplit, parts);
    }

    private async fetchOriginalSplit(transactionId: string): Promise<TransactionSplit> {
        const spinner = ora('Fetching transaction...').start();
        const originalSplit = await failSpinnerOnError(spinner, 'Failed to fetch transaction', () =>
            this.splitService.getSingleSplit(transactionId)
        );
        spinner.succeed('Transaction fetched');

        console.log(this.displayService.formatOriginalTransaction(originalSplit, transactionId));
        return originalSplit;
    }

    /** Prompts for each value the CLI parameters did not give */
    private async resolveParts(
        originalSplit: TransactionSplit,
        { amount, descriptions }: SplitTransactionParams
    ): Promise<SplitParts> {
        const [firstAmount, secondAmount] = await this.resolveAmounts(originalSplit, amount);
        const firstDescription = await this.resolveDescription(originalSplit, 1, descriptions?.[0]);
        const secondDescription = await this.resolveDescription(
            originalSplit,
            2,
            descriptions?.[1]
        );

        return [
            { amount: firstAmount.toFixed(2), description: firstDescription },
            { amount: secondAmount.toFixed(2), description: secondDescription },
        ];
    }

    /** @throws when a CLI `amount` is not one the split can take */
    private async resolveAmounts(
        originalSplit: TransactionSplit,
        amount: string | undefined
    ): Promise<[number, number]> {
        const originalAmount = parseFloat(originalSplit.amount);
        const currencySymbol = currencySymbolOf(originalSplit);

        const firstAmount = amount
            ? parseSplitAmount(amount, originalAmount, currencySymbol)
            : await this.userInputService.getSplitAmount(originalAmount, currencySymbol);
        const secondAmount = remainderAmount(originalAmount, firstAmount);

        console.log(this.displayService.formatRemainder(secondAmount, currencySymbol));
        return [firstAmount, secondAmount];
    }

    /** The original description, with the custom text appended when there is any */
    private async resolveDescription(
        originalSplit: TransactionSplit,
        splitNumber: number,
        customText: string | undefined
    ): Promise<string> {
        const text = customText ?? (await this.userInputService.getCustomSplitText(splitNumber));
        return text ? `${originalSplit.description} ${text}` : originalSplit.description;
    }

    private async applySplit(
        transactionId: string,
        originalSplit: TransactionSplit,
        parts: SplitParts
    ): Promise<void> {
        const spinner = ora('Splitting transaction...').start();
        const updated = await failSpinnerOnError(spinner, 'Failed to split transaction', () =>
            this.splitService.splitTransaction(transactionId, originalSplit, parts)
        );
        spinner.succeed('Transaction split successfully');

        console.log(
            this.displayService.formatSuccess(transactionId, updated.attributes.transactions.length)
        );
    }
}

/** Rethrows for the CLI to print once. */
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
