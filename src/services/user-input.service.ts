import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { expand, checkbox, search, input, confirm } from '@inquirer/prompts';
import { ReviewAction } from '../types/enums.js';
import { EditTransactionAttribute } from '../types/enums.js';
import { CurrencyUtils } from '../utils/currency.utils.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { DisplayFormatterUtils } from '../utils/display-formatter.utils.js';
import { SuggestionSource } from '../types/categorize.types.js';
import { validateSplitAmount } from '../utils/split-amount.utils.js';

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

export class UserInputService {
    private readonly MAX_DESCRIPTION_LENGTH = 50;
    private readonly DESCRIPTION_TRUNCATE_LENGTH = 47;

    constructor(private baseUrl: string) {}

    /**
     * @param transactionId for the link; no link when undefined
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

                        choices.sort((a, b) => {
                            if (a.value === currentValue) return -1;
                            if (b.value === currentValue) return 1;
                            if (a.value === aiSuggestion) return -1;
                            if (b.value === aiSuggestion) return 1;
                            return a.value.localeCompare(b.value);
                        });

                        return choices;
                    }

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

    private formatChange(
        field: string,
        oldValue: string | undefined,
        newValue: string,
        source?: SuggestionSource
    ): string {
        const label = source ? ` ${chalk.dim(source === 'history' ? '(history)' : '(AI)')}` : '';
        return `${chalk.bold(field)}: ${chalk.redBright(oldValue || 'None')} → ${chalk.cyan(newValue)}${label}`;
    }

    private formatCurrentValue(field: string, currentValue: string | undefined): string {
        return `${chalk.bold(field)}: ${chalk.dim(currentValue || 'None')}`;
    }

    private formatUnchanged(field: string, value: string): string {
        return `${this.formatCurrentValue(field, value)} ${chalk.dim('(unchanged)')}`;
    }

    private formatDescription(description: string, transactionId: string | undefined): string {
        const truncatedDescription =
            description.length > this.MAX_DESCRIPTION_LENGTH
                ? `${description.substring(0, this.DESCRIPTION_TRUNCATE_LENGTH)}...`
                : description;

        return DisplayFormatterUtils.linkedText(truncatedDescription, this.baseUrl, transactionId);
    }

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

    async getSplitAmount(originalAmount: number, currencySymbol: string): Promise<number> {
        const answer = await input({
            message: `Enter amount for first split (original: ${currencySymbol}${originalAmount}):`,
            validate: (value: string) => validateSplitAmount(value, originalAmount, currencySymbol),
        });

        return parseFloat(answer);
    }

    /** @returns the trimmed text, or an empty string when the user skips */
    async getCustomSplitText(splitNumber: number): Promise<string> {
        const customText = await input({
            message: `Custom text for split ${splitNumber} (press Enter to skip):`,
            default: '',
        });

        return customText.trim();
    }

    async confirmSplit(): Promise<boolean> {
        return await confirm({
            message: chalk.bold('Proceed with split?'),
            default: true,
        });
    }
}
