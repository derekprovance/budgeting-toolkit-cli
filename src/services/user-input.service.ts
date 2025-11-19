import { BudgetRead, CategoryProperties, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { expand, checkbox, select } from '@inquirer/prompts';
import { UpdateTransactionMode } from '../types/enum/update-transaction-mode.enum';
import { EditTransactionAttribute } from '../types/enum/edit-transaction-attribute.enum';

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
     * @param options The proposed changes to the transaction
     * @returns Promise<boolean> Whether the user approved the changes
     * @throws Error if the transaction is invalid
     */
    async askToUpdateTransaction(
        transaction: TransactionSplit,
        transactionId: string | undefined,
        options: TransactionUpdateOptions
    ): Promise<UpdateTransactionMode> {
        if (!transaction) {
            throw new Error('Transaction cannot be null or undefined');
        }

        const changes = this.getChangeList(transaction, options);
        if (changes.length === 0) {
            return UpdateTransactionMode.Skip;
        }

        const message = this.formatUpdateMessage(transaction, transactionId, changes);

        return this.promptUser(message, options);
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
        categories: CategoryProperties[]
    ): Promise<CategoryProperties | undefined> {
        const answer = await this.createSelectDropdown(
            categories.map(category => category.name),
            'Select a new Category'
        );

        return categories.find(category => {
            if (category.name === answer) {
                return category;
            }
        });
    }

    async getNewBudget(budgets: BudgetRead[]): Promise<BudgetRead | undefined> {
        const answer = await this.createSelectDropdown(
            budgets.map(budget => budget.attributes.name),
            'Select a new Budget'
        );

        return budgets.find(budget => {
            if (budget.attributes.name === answer) {
                return budget;
            }
        });
    }

    private async createSelectDropdown(
        values: string[],
        message: string
    ): Promise<string | undefined> {
        const choices = [];

        for (const value of values) {
            choices.push({
                name: value,
                value: value,
            });
        }

        return await select({
            message,
            choices: values,
        });
    }

    /**
     * Gets a list of changes to be made to the transaction
     */
    private getChangeList(
        transaction: TransactionSplit,
        options: TransactionUpdateOptions
    ): string[] {
        return [
            options.category &&
                options.category !== transaction.category_name &&
                this.formatChange(
                    EditTransactionAttribute.Category,
                    transaction.category_name ?? undefined,
                    options.category
                ),
            options.budget &&
                options.budget !== transaction.budget_name &&
                this.formatChange(
                    EditTransactionAttribute.Budget,
                    transaction.budget_name ?? undefined,
                    options.budget
                ),
        ].filter(Boolean) as string[];
    }

    /**
     * Formats a single change for display
     */
    private formatChange(field: string, oldValue: string | undefined, newValue: string): string {
        return `${field}: ${chalk.redBright(oldValue || 'None')} → ${chalk.cyan(newValue)}`;
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
    private async promptUser(
        message: string,
        options: TransactionUpdateOptions
    ): Promise<UpdateTransactionMode> {
        type InquirerKey = 'a' | 'b' | 'c' | 'e' | 's';

        const choices: Array<{
            key: InquirerKey;
            name: string;
            value: UpdateTransactionMode;
        }> = [
            {
                key: 'a',
                name: 'Update all',
                value: UpdateTransactionMode.Both,
            },
        ];

        if (options.budget) {
            choices.push({
                key: 'b',
                name: 'Update only the budget',
                value: UpdateTransactionMode.Budget,
            });
        }

        if (options.category) {
            choices.push({
                key: 'c',
                name: 'Update only the category',
                value: UpdateTransactionMode.Category,
            });
        }

        choices.push({
            key: 'e',
            name: 'Edit',
            value: UpdateTransactionMode.Edit,
        });

        choices.push({
            key: 's',
            name: 'Skip',
            value: UpdateTransactionMode.Skip,
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
}
