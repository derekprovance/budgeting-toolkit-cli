import {
    TransactionSplit,
    CategoryProperties,
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
        [UpdateTransactionMode.Both]: (category?: CategoryProperties, budget?: BudgetRead) =>
            [category?.name, budget?.id] as const,
        [UpdateTransactionMode.Budget]: (_category?: CategoryProperties, budget?: BudgetRead) =>
            [undefined, budget?.id] as const,
        [UpdateTransactionMode.Category]: (
            category?: CategoryProperties,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _budget?: BudgetRead
        ) => [category?.name, undefined] as const,
    } as const;

    constructor(
        private readonly transactionService: TransactionService,
        private readonly validator: TransactionValidatorService,
        private readonly userInputService: UserInputService,
        private readonly dryRun: boolean = false,
        private readonly categories: CategoryProperties[],
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
            return;
        }

        try {
            const journalId = transaction.transaction_journal_id;

            if (!journalId) {
                logger.warn(
                    {
                        description: transaction.description,
                    },
                    'Transaction missing journal ID, skipping'
                );
                return;
            }

            const category = this.validateAICategory(aiResults[journalId]?.category, transaction);
            const budget = await this.validateAIBudget(aiResults[journalId]?.budget, transaction);

            if (!this.validator.categoryOrBudgetChanged(transaction, category, budget)) {
                return;
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
            return;
        }
    }

    private validateAICategory(
        aiCategory: string | undefined,
        transaction: TransactionSplit
    ): CategoryProperties | undefined {
        let category;
        if (aiCategory && aiCategory !== '') {
            category = this.getValidCategory(aiCategory);
            if (!category) {
                logger.warn(
                    {
                        transactionId: transaction.transaction_journal_id,
                        description: transaction.description,
                        attemptedCategory: aiCategory,
                        validCategories: this.categories?.map(c => c.name),
                    },
                    'Invalid or unrecognized category from AI, skipping transaction'
                );
                return;
            }
        } else if (aiCategory === '') {
            logger.warn(
                {
                    transactionId: transaction.transaction_journal_id,
                    description: transaction.description,
                    attemptedCategory: aiCategory,
                },
                'Empty category from AI, skipping transaction'
            );
            return;
        }

        return category;
    }

    private async validateAIBudget(
        aiBudget: string | undefined,
        transaction: TransactionSplit
    ): Promise<BudgetRead | undefined> {
        const shouldUpdateBudget = await this.validator.shouldSetBudget(transaction);

        let budget;
        if (shouldUpdateBudget && aiBudget && aiBudget !== '') {
            budget = this.getValidBudget(aiBudget);
            if (!budget) {
                logger.warn(
                    {
                        transactionId: transaction.transaction_journal_id,
                        description: transaction.description,
                        attemptedBudget: aiBudget,
                        validBudgets: this.budgets?.map(b => b.attributes.name),
                    },
                    'Invalid or unrecognized budget from AI, skipping transaction'
                );
                return;
            }
        } else if (shouldUpdateBudget && aiBudget === '') {
            logger.warn(
                {
                    transactionId: transaction.transaction_journal_id,
                    description: transaction.description,
                    attemptedBudget: aiBudget,
                },
                'Empty budget from AI, skipping transaction'
            );
            return;
        }

        return budget;
    }

    private async handleUpdateWorkflow(
        transaction: TransactionSplit,
        transactionRead: TransactionRead | undefined,
        category: CategoryProperties | undefined,
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
                return;
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
    ): Promise<[CategoryProperties | undefined, BudgetRead | undefined]> {
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
            return;
        }

        return this.budgets?.find(b => b.attributes.name === value);
    }

    /**
     * Gets a valid category from the available categories
     * @param categories Available categories
     * @param value Category name to find
     * @returns The matching category or undefined
     */
    private getValidCategory(value: string | undefined): CategoryProperties | undefined {
        if (!value) {
            return;
        }

        return this.categories?.find(c => c?.name === value);
    }
}
