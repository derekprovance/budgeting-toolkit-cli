import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { expand, checkbox, search, input, confirm } from '@inquirer/prompts';
import { ReviewAction } from '../types/enums.js';
import { EditTransactionAttribute } from '../types/enums.js';
import { CurrencyUtils } from '../utils/currency.utils.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { DisplayFormatterUtils } from '../utils/display-formatter.utils.js';
import { SuggestionSource } from '../types/categorize.types.js';

/**
 * Interface for transaction update options
 */
interface TransactionUpdateOptions {
    /**
     * Whether the transaction may be given a budget (the validator's
     * shouldSetBudget). When false the budget shows as N/A and cannot be chosen.
     */
    canSetBudget: boolean;
    category?: string;
    budget?: string;
    /** Where each suggestion came from; shown after the proposed value */
    source?: { category?: SuggestionSource; budget?: SuggestionSource };
    /** Position of this transaction in the review, shown as `[index/total]` */
    progress?: { index: number; total: number };
}

/** The user ended the review (Ctrl-C at a prompt); nothing further should be asked */
export class ReviewCancelledError extends Error {
    constructor(options?: ErrorOptions) {
        super('Review cancelled by the user', options);
        this.name = 'ReviewCancelledError';
    }
}

/**
 * Awaits a review prompt. Inquirer rejects with an `ExitPromptError` when the
 * user presses Ctrl-C; that becomes a ReviewCancelledError.
 */
async function reviewPrompt<T>(prompt: Promise<T>): Promise<T> {
    try {
        return await prompt;
    } catch (error) {
        if (error instanceof Error && error.name === 'ExitPromptError') {
            throw new ReviewCancelledError({ cause: error });
        }
        throw error;
    }
}

/**
 * Service for handling user input interactions
 */
export class UserInputService {
    private readonly MAX_DESCRIPTION_LENGTH = 50;
    private readonly DESCRIPTION_TRUNCATE_LENGTH = 47;

    constructor(private baseUrl: string) {}

    /**
     * Computes the remainder for the second split, rounded to cents to avoid
     * floating-point drift.
     */
    static remainderAmount(originalAmount: number, firstSplitAmount: number): number {
        return parseFloat((originalAmount - firstSplitAmount).toFixed(2));
    }

    /**
     * Asks the user whether to update a transaction with new category and/or budget
     * @param transactionId The Firefly transaction id, for the link; none when undefined
     * @throws ReviewCancelledError when the user presses Ctrl-C
     */
    async askToUpdateTransaction(
        transaction: TransactionSplit,
        transactionId: string | undefined,
        options: TransactionUpdateOptions
    ): Promise<ReviewAction> {
        const changes = this.getChangeList(transaction, options);
        const message = this.formatUpdateMessage(
            transaction,
            transactionId,
            changes,
            options.progress
        );
        return this.promptUser(message, options.canSetBudget);
    }

    /**
     * Prints a blank line that separates one transaction's review from the previous one
     */
    printSeparator(): void {
        console.log();
    }

    async shouldEditCategoryBudget(canSetBudget: boolean): Promise<EditTransactionAttribute[]> {
        const choices: { name: string; value: EditTransactionAttribute; description: string }[] = [
            {
                name: 'Modify Category',
                value: EditTransactionAttribute.Category,
                description: 'Change the category suggested by AI',
            },
        ];

        if (canSetBudget) {
            choices.push({
                name: 'Modify Budget',
                value: EditTransactionAttribute.Budget,
                description: 'Change the budget suggested by AI',
            });
        }

        return reviewPrompt(checkbox({ message: 'What do you want to edit?', choices }));
    }

    /** @returns The chosen name, one of `categoryNames` */
    async getNewCategory(
        categoryNames: string[],
        suggestedCategory?: string,
        aiSuggestion?: string
    ): Promise<string> {
        return this.createSearchableDropdown(
            categoryNames,
            'Select a new Category (type to search)',
            suggestedCategory,
            aiSuggestion
        );
    }

    /** @returns The chosen name, one of `budgetNames` */
    async getNewBudget(
        budgetNames: string[],
        suggestedBudget?: string,
        aiSuggestion?: string
    ): Promise<string> {
        return this.createSearchableDropdown(
            budgetNames,
            'Select a new Budget (type to search)',
            suggestedBudget,
            aiSuggestion
        );
    }

    private async createSearchableDropdown(
        values: string[],
        message: string,
        currentValue?: string,
        aiSuggestion?: string
    ): Promise<string> {
        // AI suggestion takes precedence when a value is both current and suggested
        const toChoice = (name: string) => {
            let label = name;
            if (name === aiSuggestion) {
                label = `${name} ${chalk.cyan('(AI suggested)')}`;
            } else if (name === currentValue) {
                label = `${name} ${chalk.green('(current)')}`;
            }
            return { value: name, name: label };
        };

        return reviewPrompt(
            search({
                message,
                source: async input => {
                    if (!input) {
                        const choices = values.map(toChoice);

                        // Sort: current first, then AI suggestion, then alphabetical
                        choices.sort((a, b) => {
                            if (a.value === currentValue) return -1;
                            if (b.value === currentValue) return 1;
                            if (a.value === aiSuggestion) return -1;
                            if (b.value === aiSuggestion) return 1;
                            return a.value.localeCompare(b.value);
                        });

                        return choices;
                    }

                    // Filter based on user input (case-insensitive)
                    const searchLower = input.toLowerCase();
                    return values
                        .filter(name => name.toLowerCase().includes(searchLower))
                        .map(toChoice);
                },
            })
        );
    }

    /** One row per field: its suggested change, or its current value */
    private getChangeList(
        transaction: TransactionSplit,
        options: TransactionUpdateOptions
    ): string[] {
        return [
            this.describeField(
                EditTransactionAttribute.Category,
                transaction.category_name,
                options.category,
                options.source?.category
            ),
            options.canSetBudget
                ? this.describeField(
                      EditTransactionAttribute.Budget,
                      transaction.budget_name,
                      options.budget,
                      options.source?.budget
                  )
                : `${chalk.bold(EditTransactionAttribute.Budget)}: ${chalk.dim('N/A')}`,
        ];
    }

    private describeField(
        field: EditTransactionAttribute,
        current: string | null | undefined,
        suggested: string | undefined,
        source: SuggestionSource | undefined
    ): string {
        if (!suggested) {
            return this.formatCurrentValue(field, current ?? undefined);
        }
        if (suggested === current) {
            return this.formatUnchanged(field, suggested);
        }
        return this.formatChange(field, current ?? undefined, suggested, source);
    }

    /**
     * Formats a single change for display (old value → new value)
     */
    private formatChange(
        field: string,
        oldValue: string | undefined,
        newValue: string,
        source?: SuggestionSource
    ): string {
        const label = source ? ` ${chalk.dim(source === 'history' ? '(history)' : '(AI)')}` : '';
        return `${chalk.bold(field)}: ${chalk.redBright(oldValue || 'None')} → ${chalk.cyan(newValue)}${label}`;
    }

    /**
     * Formats a current value for display (no change indicator)
     */
    private formatCurrentValue(field: string, currentValue: string | undefined): string {
        return `${chalk.bold(field)}: ${chalk.dim(currentValue || 'None')}`;
    }

    /**
     * Formats a suggestion that matches the current value
     */
    private formatUnchanged(field: string, value: string): string {
        return `${this.formatCurrentValue(field, value)} ${chalk.dim('(unchanged)')}`;
    }

    /**
     * Formats the transaction description, truncating if necessary
     */
    private formatDescription(description: string, transactionId: string | undefined): string {
        const truncatedDescription =
            description.length > this.MAX_DESCRIPTION_LENGTH
                ? `${description.substring(0, this.DESCRIPTION_TRUNCATE_LENGTH)}...`
                : description;

        const url =
            this.baseUrl && transactionId ? this.getTransactionLink(transactionId) : undefined;
        return DisplayFormatterUtils.createHyperlink(truncatedDescription, url);
    }

    /**
     * Formats the complete update message
     */
    private formatUpdateMessage(
        transaction: TransactionSplit,
        transactionId: string | undefined,
        changes: string[],
        progress?: { index: number; total: number }
    ): string {
        const rawAmount = TransactionCalculationUtils.parseAmountSafe(transaction.amount);
        const formatted = CurrencyUtils.formatWithSymbol(
            rawAmount,
            transaction.currency_symbol ?? ''
        );
        let amountDisplay: string;
        if (transaction.type === 'withdrawal') {
            amountDisplay = chalk.red(`-${formatted}`);
        } else if (transaction.type === 'deposit') {
            amountDisplay = chalk.green(`+${formatted}`);
        } else {
            amountDisplay = chalk.dim(formatted);
        }

        // No leading newline: the prompt prefix (? / ✔) belongs on this line
        const counter = progress ? `${chalk.dim(`[${progress.index}/${progress.total}]`)} ` : '';

        return [
            `${counter}${chalk.bold('Transaction:')} "${chalk.yellow(
                this.formatDescription(transaction.description, transactionId)
            )}" ${amountDisplay}`,
            `${chalk.bold('Proposed changes:')}`,
            ...changes.map(change => `  • ${change}`),
            `\n${chalk.bold('Apply these changes?')}`,
        ].join('\n');
    }

    /**
     * Prompts the user for confirmation
     */
    private async promptUser(message: string, canSetBudget: boolean): Promise<ReviewAction> {
        type InquirerKey = 'a' | 'b' | 'c' | 'e' | 's';

        const choices: Array<{
            key: InquirerKey;
            name: string;
            value: ReviewAction;
        }> = [
            {
                key: 'a',
                name: 'Update all',
                value: ReviewAction.UpdateAll,
            },
        ];

        if (canSetBudget) {
            choices.push({
                key: 'b',
                name: 'Update only the budget',
                value: ReviewAction.UpdateBudget,
            });
        }

        choices.push({
            key: 'c',
            name: 'Update only the category',
            value: ReviewAction.UpdateCategory,
        });

        choices.push({
            key: 'e',
            name: 'Edit',
            value: ReviewAction.Edit,
        });

        choices.push({
            key: 's',
            name: 'Skip',
            value: ReviewAction.Skip,
        });

        return reviewPrompt(expand({ message, default: 'a', choices }));
    }

    /*
     * Returns the link to show a transaction to the user
     */
    private getTransactionLink(transactionId: string | undefined) {
        return DisplayFormatterUtils.transactionUrl(this.baseUrl, transactionId ?? '');
    }

    /**
     * Prompts user to enter the amount for the first split
     * @param originalAmount The original transaction amount
     * @param currencySymbol The currency symbol
     * @returns Promise<number> The amount entered by the user
     */
    /**
     * Validates a split amount value
     * @param value The amount string to validate
     * @param originalAmount The original transaction amount
     * @param currencySymbol Currency symbol for error messages
     * @returns true if valid, error message string if invalid
     */
    validateSplitAmount(
        value: string,
        originalAmount: number,
        currencySymbol: string
    ): true | string {
        // Check for empty or whitespace-only input
        if (!value || value.trim() === '') {
            return 'Amount is required';
        }

        const trimmedValue = value.trim();

        // Validate format: must be a valid decimal number with max 2 decimal places
        if (!/^\d+(\.\d{1,2})?$/.test(trimmedValue)) {
            return 'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)';
        }

        const amount = parseFloat(trimmedValue);

        // Check for NaN (shouldn't happen with regex, but defensive)
        if (isNaN(amount)) {
            return 'Please enter a valid number';
        }

        // Check for negative (regex should prevent, but explicit check)
        if (amount < 0) {
            return 'Amount cannot be negative';
        }

        // Check for zero
        if (amount === 0) {
            return 'Amount must be greater than zero';
        }

        // Check if amount is less than minimum (1 cent)
        if (amount < 0.01) {
            return 'Amount must be at least 0.01';
        }

        // Check if amount would leave nothing for second split
        if (amount >= originalAmount) {
            return `Amount must be less than the original amount (${currencySymbol}${originalAmount})`;
        }

        // Validate minimum second split amount (at least 1 cent)
        const secondSplitAmount = UserInputService.remainderAmount(originalAmount, amount);
        if (secondSplitAmount < 0.01) {
            return `Second split would be too small (${currencySymbol}${secondSplitAmount.toFixed(2)}). Please enter a smaller amount.`;
        }

        return true;
    }

    async getSplitAmount(originalAmount: number, currencySymbol: string): Promise<number> {
        const answer = await input({
            message: `Enter amount for first split (original: ${currencySymbol}${originalAmount}):`,
            validate: (value: string) =>
                this.validateSplitAmount(value, originalAmount, currencySymbol),
        });

        return parseFloat(answer);
    }

    /**
     * Prompts user to optionally add custom text to a split description
     * @param splitNumber The split number (1 or 2) for display purposes
     * @returns Promise<string> The custom text to append (empty string if none)
     */
    async getCustomSplitText(splitNumber: number): Promise<string> {
        const customText = await input({
            message: `Custom text for split ${splitNumber} (press Enter to skip):`,
            default: '',
        });

        return customText.trim();
    }

    /**
     * Confirms the split operation with the user
     * @returns Promise<boolean> Whether the user confirmed
     */
    async confirmSplit(): Promise<boolean> {
        return await confirm({
            message: chalk.bold('Proceed with split?'),
            default: true,
        });
    }
}
