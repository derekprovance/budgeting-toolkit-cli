import { BudgetRead, CategoryProperties, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { expand, checkbox, search, input, confirm } from '@inquirer/prompts';
import { CategorizeMode } from '../types/enums.js';
import { EditTransactionAttribute } from '../types/enums.js';

/**
 * Interface for transaction update options
 */
interface TransactionUpdateOptions {
    category?: string;
    budget?: string;
}

/**
 * Service for handling user input interactions
 */
export class UserInputService {
    private readonly MAX_DESCRIPTION_LENGTH = 50;
    private readonly DESCRIPTION_TRUNCATE_LENGTH = 47;

    constructor(private baseUrl: string) {}

    /**
     * Asks the user whether to update a transaction with new category and/or budget
     * @param transaction The transaction to potentially update
     * @param transactionId The transaction ID for linking
     * @param options The proposed changes to the transaction
     * @param updateMode The mode indicating what to update (category, budget, or both)
     * @returns Promise<CategorizeMode> The user's choice
     * @throws Error if the transaction is invalid
     */
    async askToUpdateTransaction(
        transaction: TransactionSplit,
        transactionId: string | undefined,
        options: TransactionUpdateOptions
    ): Promise<CategorizeMode> {
        if (!transaction) {
            throw new Error('Transaction cannot be null or undefined');
        }

        const changes = this.getChangeList(transaction, options);
        if (changes.length === 0) {
            return CategorizeMode.Skip;
        }

        const message = this.formatUpdateMessage(transaction, transactionId, changes);

        return this.promptUser(message);
    }

    async shouldEditCategoryBudget(): Promise<string[]> {
        const answer = await checkbox({
            message: 'What do you want to edit?',
            choices: [
                {
                    name: 'Modify Category',
                    value: EditTransactionAttribute.Category,
                    description: 'Change the category suggested by AI',
                },
                {
                    name: 'Modify Budget',
                    value: EditTransactionAttribute.Budget,
                    description: 'Change the budget suggested by AI',
                },
            ],
        });

        return answer;
    }

    async getNewCategory(
        categoryNames: string[],
        suggestedCategory?: string,
        aiSuggestion?: string
    ): Promise<CategoryProperties | undefined> {
        const answer = await this.createSearchableDropdown(
            categoryNames,
            'Select a new Category (type to search)',
            suggestedCategory,
            aiSuggestion
        );

        if (!answer) {
            return undefined;
        }

        // Return a minimal object with just the name
        // Will be resolved to full object in processEditCommand()
        return { name: answer } as CategoryProperties;
    }

    async getNewBudget(
        budgetNames: string[],
        suggestedBudget?: string,
        aiSuggestion?: string
    ): Promise<BudgetRead | undefined> {
        const answer = await this.createSearchableDropdown(
            budgetNames,
            'Select a new Budget (type to search)',
            suggestedBudget,
            aiSuggestion
        );

        if (!answer) {
            return undefined;
        }

        // Return a minimal object with just the name
        // Will be resolved to full object in processEditCommand()
        return {
            id: '',
            attributes: { name: answer },
        } as BudgetRead;
    }

    private async createSearchableDropdown(
        values: string[],
        message: string,
        currentValue?: string,
        aiSuggestion?: string
    ): Promise<string | undefined> {
        return await search({
            message,
            source: async input => {
                if (!input) {
                    // Show all values with appropriate labels
                    const choices = values.map(name => {
                        const isAI = name === aiSuggestion;
                        const isCurrent = name === currentValue;

                        let label = name;
                        if (isAI && isCurrent) {
                            // Same value for both - only show AI label
                            label = `${name} ${chalk.cyan('(AI suggested)')}`;
                        } else if (isCurrent) {
                            label = `${name} ${chalk.green('(current)')}`;
                        } else if (isAI) {
                            label = `${name} ${chalk.cyan('(AI suggested)')}`;
                        }

                        return {
                            value: name,
                            name: label,
                        };
                    });

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
                const filtered = values.filter(name => name.toLowerCase().includes(searchLower));

                return filtered.map(name => {
                    const isAI = name === aiSuggestion;
                    const isCurrent = name === currentValue;

                    let label = name;
                    if (isAI && isCurrent) {
                        label = `${name} ${chalk.cyan('(AI suggested)')}`;
                    } else if (isCurrent) {
                        label = `${name} ${chalk.green('(current)')}`;
                    } else if (isAI) {
                        label = `${name} ${chalk.cyan('(AI suggested)')}`;
                    }

                    return {
                        value: name,
                        name: label,
                    };
                });
            },
        });
    }

    /**
     * Gets a list of changes to be made to the transaction
     * @param transaction The transaction being updated
     * @param options The proposed changes (category and/or budget)
     * @param updateMode The mode indicating what to update (category, budget, or both)
     * @returns Array of formatted change strings to display
     */
    private getChangeList(
        transaction: TransactionSplit,
        options: TransactionUpdateOptions
    ): string[] {
        const changes: string[] = [];

        // Always show both fields for all modes - this gives users flexibility to manually set either field
        // If AI has a suggestion, show as a change. Otherwise, just show current value.

        // Category field
        if (options.category) {
            // AI has a suggestion - show as change
            changes.push(
                this.formatChange(
                    EditTransactionAttribute.Category,
                    transaction.category_name ?? undefined,
                    options.category
                )
            );
        } else {
            // No AI suggestion - just show current value
            changes.push(
                this.formatCurrentValue(
                    EditTransactionAttribute.Category,
                    transaction.category_name ?? undefined
                )
            );
        }

        // Budget field
        if (options.budget) {
            // AI has a suggestion - show as change
            changes.push(
                this.formatChange(
                    EditTransactionAttribute.Budget,
                    transaction.budget_name ?? undefined,
                    options.budget
                )
            );
        } else {
            // No AI suggestion - just show current value
            changes.push(
                this.formatCurrentValue(
                    EditTransactionAttribute.Budget,
                    transaction.budget_name ?? undefined
                )
            );
        }

        return changes;
    }

    /**
     * Formats a single change for display (old value → new value)
     */
    private formatChange(field: string, oldValue: string | undefined, newValue: string): string {
        return `${field}: ${chalk.redBright(oldValue || 'None')} → ${chalk.cyan(newValue)}`;
    }

    /**
     * Formats a current value for display (no change indicator)
     */
    private formatCurrentValue(field: string, currentValue: string | undefined): string {
        return `${field}: ${chalk.gray(currentValue || 'None')}`;
    }

    /**
     * Formats the transaction description, truncating if necessary
     */
    private formatDescription(description: string, transactionId: string | undefined): string {
        const truncatedDescription =
            description.length > this.MAX_DESCRIPTION_LENGTH
                ? `${description.substring(0, this.DESCRIPTION_TRUNCATE_LENGTH)}...`
                : description;

        return transactionId
            ? `\x1B]8;;${this.getTransactionLink(transactionId)}\x1B\\${truncatedDescription}\x1B]8;;\x1B\\`
            : truncatedDescription;
    }

    /**
     * Formats the complete update message
     */
    private formatUpdateMessage(
        transaction: TransactionSplit,
        transactionId: string | undefined,
        changes: string[]
    ): string {
        return [
            `${chalk.bold('\nTransaction:')} "${chalk.yellow(
                this.formatDescription(transaction.description, transactionId)
            )}"`,
            `${chalk.bold('Proposed changes:')}`,
            ...changes.map(change => chalk.gray(`  • ${change}`)),
            `\n${chalk.bold('Apply these changes?')}`,
        ].join('\n');
    }

    /**
     * Prompts the user for confirmation
     */
    private async promptUser(message: string): Promise<CategorizeMode> {
        type InquirerKey = 'a' | 'b' | 'c' | 'e' | 's';

        const choices: Array<{
            key: InquirerKey;
            name: string;
            value: CategorizeMode;
        }> = [
            {
                key: 'a',
                name: 'Update all',
                value: CategorizeMode.Both,
            },
        ];

        // Always offer both individual update options
        // This allows users to manually set fields via Edit even when AI didn't suggest a value
        choices.push({
            key: 'b',
            name: 'Update only the budget',
            value: CategorizeMode.Budget,
        });

        choices.push({
            key: 'c',
            name: 'Update only the category',
            value: CategorizeMode.Category,
        });

        choices.push({
            key: 'e',
            name: 'Edit',
            value: CategorizeMode.Edit,
        });

        choices.push({
            key: 's',
            name: 'Skip',
            value: CategorizeMode.Skip,
        });

        const answer = await expand({
            message,
            default: 'a',
            choices,
        });

        return answer;
    }

    /*
     * Returns the link to show a transaction to the user
     */
    private getTransactionLink(transactionId: string | undefined) {
        return `${this.baseUrl}/transactions/show/${transactionId}`;
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
        const secondSplitAmount = parseFloat((originalAmount - amount).toFixed(2));
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
