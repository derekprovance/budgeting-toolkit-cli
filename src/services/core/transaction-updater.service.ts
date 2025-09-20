import {
    TransactionSplit,
    Category,
    BudgetRead,
    TransactionRead,
} from '@derekprovance/firefly-iii-sdk';
import { TransactionService } from './transaction.service';
import { TransactionValidatorService } from './transaction-validator.service';
import { UserInputService } from '../user-input.service';
import { logger } from '../../logger';
import { UpdateTransactionMode } from '../../types/enum/update-transaction-mode.enum';
import { EditTransactionAttribute } from '../../types/enum/edit-transaction-attribute.enum';

export class TransactionUpdaterService {
    private readonly updateParameterMap = {
        [UpdateTransactionMode.Both]: (category?: Category, budget?: BudgetRead) =>
            [category?.name, budget?.id] as const,
        [UpdateTransactionMode.Budget]: (_category?: Category, budget?: BudgetRead) =>
            [undefined, budget?.id] as const,
        [UpdateTransactionMode.Category]: (
            category?: Category,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _budget?: BudgetRead
        ) => [category?.name, undefined] as const,
    } as const;

    constructor(
        private readonly transactionService: TransactionService,
        private readonly validator: TransactionValidatorService,
        private readonly userInputService: UserInputService,
        private readonly dryRun: boolean = false,
        private readonly categories: Category[],
        private readonly budgets: BudgetRead[]
    ) {}

    /**
     * Updates a transaction with new category and budget
     * @param transaction The transaction to update
     * @param aiResults The AI results for the transaction
     * @param categories Available categories
     * @param budgets Available budgets
     * @returns A promise that resolves to the updated transaction or undefined if not updated
     */
    async updateTransaction(
        transaction: TransactionSplit,
        aiResults: Record<string, { category?: string; budget?: string }>
    ): Promise<TransactionRead | undefined> {
        if (!this.validator.validateTransactionData(transaction, aiResults)) {
            return undefined;
        }

        try {
            const shouldUpdateBudget = await this.validator.shouldSetBudget(transaction);
            const journalId = transaction.transaction_journal_id;

            if (!journalId) {
                logger.warn(
                    {
                        description: transaction.description,
                    },
                    'Transaction missing journal ID, skipping'
                );
                return undefined;
            }

            // --- Begin: Validate AI category and budget ---
            const aiCategory = aiResults[journalId]?.category;
            const aiBudget = aiResults[journalId]?.budget;

            // If a category is proposed, it must be non-empty and valid
            let category;
            if (aiCategory && aiCategory !== '') {
                category = this.getValidCategory(aiCategory);
                if (!category) {
                    logger.warn(
                        {
                            transactionId: journalId,
                            description: transaction.description,
                            attemptedCategory: aiCategory,
                            validCategories: this.categories?.map(c => c.name),
                        },
                        'Invalid or unrecognized category from AI, skipping transaction'
                    );
                    return undefined;
                }
            } else if (aiCategory === '') {
                logger.warn(
                    {
                        transactionId: journalId,
                        description: transaction.description,
                        attemptedCategory: aiCategory,
                    },
                    'Empty category from AI, skipping transaction'
                );
                return undefined;
            }

            // If a budget is proposed, it must be non-empty and valid
            let budget;
            if (shouldUpdateBudget && aiBudget && aiBudget !== '') {
                budget = this.getValidBudget(aiBudget);
                if (!budget) {
                    logger.warn(
                        {
                            transactionId: journalId,
                            description: transaction.description,
                            attemptedBudget: aiBudget,
                            validBudgets: this.budgets?.map(b => b.attributes.name),
                        },
                        'Invalid or unrecognized budget from AI, skipping transaction'
                    );
                    return undefined;
                }
            } else if (shouldUpdateBudget && aiBudget === '') {
                logger.warn(
                    {
                        transactionId: journalId,
                        description: transaction.description,
                        attemptedBudget: aiBudget,
                    },
                    'Empty budget from AI, skipping transaction'
                );
                return undefined;
            }
            // --- End: Validate AI category and budget ---

            if (!this.validator.categoryOrBudgetChanged(transaction, category, budget)) {
                return undefined;
            }

            const transactionRead = this.transactionService.getTransactionReadBySplit(transaction);
            if (this.dryRun) {
                logger.debug(
                    {
                        transactionId: journalId,
                        description: transaction.description,
                        proposedCategory: category?.name,
                        proposedBudget: budget?.attributes.name,
                    },
                    'Dry run - showing proposed changes'
                );
                return transactionRead;
            }

            const updatedTransaction = await this.handleUpdateWorkflow(
                transaction,
                transactionRead,
                category,
                budget
            );

            logger.debug(
                { description: transaction.description },
                'Successfully updated transaction:'
            );

            return updatedTransaction;
        } catch (error) {
            logger.error(
                {
                    description: transaction.description,
                    error,
                },
                'Error processing transaction:'
            );
            return undefined;
        }
    }

    private async handleUpdateWorkflow(
        transaction: TransactionSplit,
        transactionRead: TransactionRead | undefined,
        category: Category | undefined,
        budget: BudgetRead | undefined
    ): Promise<TransactionRead | undefined> {
        let action;
        do {
            action = await this.userInputService.askToUpdateTransaction(
                transaction,
                transactionRead?.id,
                {
                    category: category?.name,
                    budget: budget?.attributes.name,
                }
            );

            if (action === UpdateTransactionMode.Abort) {
                logger.debug(
                    { description: transaction.description },
                    'User skipped transaction update'
                );
                return undefined;
            }

            if (action === UpdateTransactionMode.Edit) {
                [category, budget] = await this.processEditCommand(transaction);
            }
        } while (action === UpdateTransactionMode.Edit);

        const [categoryName, budgetId] = this.updateParameterMap[action](category, budget);

        return await this.transactionService.updateTransaction(transaction, categoryName, budgetId);
    }

    private async processEditCommand(
        transaction: TransactionSplit
    ): Promise<[Category | undefined, BudgetRead | undefined]> {
        logger.debug({ description: transaction.description }, 'User chose the edit option');

        const answers = await this.userInputService.shouldEditCategoryBudget();

        let newCategory;
        let newBudget;
        for (const answer of answers) {
            if (answer === EditTransactionAttribute.Category) {
                newCategory = await this.userInputService.getNewCategory(this.categories);
            } else if (answer === EditTransactionAttribute.Budget) {
                newBudget = await this.userInputService.getNewBudget(this.budgets);
            }
        }

        return [newCategory, newBudget];
    }

    /**
     * Gets a valid budget from the available budgets
     * @param budgets Available budgets
     * @param value Budget name to find
     * @returns The matching budget or undefined
     */
    private getValidBudget(value: string | undefined): BudgetRead | undefined {
        if (!value) {
            return undefined;
        }

        return this.budgets?.find(b => b.attributes.name === value);
    }

    /**
     * Gets a valid category from the available categories
     * @param categories Available categories
     * @param value Category name to find
     * @returns The matching category or undefined
     */
    private getValidCategory(value: string | undefined): Category | undefined {
        if (!value) {
            return undefined;
        }

        return this.categories?.find(c => c?.name === value);
    }
}
