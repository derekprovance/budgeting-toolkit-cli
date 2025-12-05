import {
    TransactionSplit,
    CategoryProperties,
    BudgetRead,
    TransactionRead,
} from '@derekprovance/firefly-iii-sdk';
import { TransactionService } from './core/transaction.service.js';
import { TransactionValidatorService } from './core/transaction-validator.service.js';
import { TransactionAIResultValidator } from './core/transaction-ai-result-validator.service.js';
import { UserInputService } from './user-input.service.js';
import { Result, TransactionValidationError } from '../types/result.type.js';
import { logger } from '../logger.js';
import { CategorizeMode } from '../types/enums.js';
import { EditTransactionAttribute } from '../types/enums.js';

export interface AIResults {
    category?: string;
    budget?: string;
}

/**
 * Service for managing interactive transaction updates with AI-suggested categories and budgets.
 * Handles user workflow, validation, and dry-run mode.
 */
export class InteractiveTransactionUpdater {
    constructor(
        private readonly transactionService: TransactionService,
        private readonly validator: TransactionValidatorService,
        private readonly aiValidator: TransactionAIResultValidator,
        private readonly userInputService: UserInputService,
        private readonly dryRun: boolean = false
    ) {}

    /**
     * Updates a transaction with AI-suggested category and budget.
     * Returns Result type for explicit error handling.
     *
     * @param transaction The transaction to update
     * @param aiResults The AI-suggested category and budget
     * @returns Result containing updated transaction or validation error
     */
    async updateTransaction(
        transaction: TransactionSplit,
        aiResults: Record<string, AIResults>
    ): Promise<Result<TransactionRead | undefined, TransactionValidationError>> {
        // Validate transaction data
        if (!this.validator.validateTransactionData(transaction, aiResults)) {
            return Result.err({
                field: 'transaction',
                message: 'Invalid transaction data',
                userMessage: 'Transaction data is incomplete or invalid',
                transactionId: transaction.transaction_journal_id || 'unknown',
                transactionDescription: transaction.description || 'No description',
            });
        }

        const journalId = transaction.transaction_journal_id;
        if (!journalId) {
            logger.warn(
                { description: transaction.description },
                'Transaction missing journal ID, skipping'
            );
            return Result.err({
                field: 'journalId',
                message: 'Transaction missing journal ID',
                userMessage: 'Cannot update transaction without journal ID',
                transactionId: 'unknown',
                transactionDescription: transaction.description || 'No description',
            });
        }

        try {
            // Validate and prepare update
            const prepareResult = await this.validateAndPrepareUpdate(
                transaction,
                aiResults[journalId]
            );
            if (!prepareResult.ok) {
                return Result.err(prepareResult.error);
            }

            const { category, budget, hasChanges } = prepareResult.value;

            // Skip if no changes detected
            if (!hasChanges) {
                logger.debug(
                    { transactionId: journalId, description: transaction.description },
                    'No changes detected for transaction'
                );
                return Result.ok(undefined);
            }

            // Handle dry-run mode
            if (this.dryRun) {
                return this.executeDryRun(transaction, journalId, category, budget);
            }

            // Execute interactive workflow
            return await this.executeInteractiveUpdate(transaction, category, budget);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error(
                { description: transaction.description, error: err.message },
                'Error processing transaction'
            );

            return Result.err({
                field: 'unknown',
                message: err.message,
                userMessage: `Failed to update transaction: ${err.message}`,
                transactionId: journalId,
                transactionDescription: transaction.description || 'No description',
                details: { error: err },
            });
        }
    }

    /**
     * Validates AI results and prepares update data
     */
    private async validateAndPrepareUpdate(
        transaction: TransactionSplit,
        aiResult?: AIResults
    ): Promise<
        Result<
            { category?: CategoryProperties; budget?: BudgetRead; hasChanges: boolean },
            TransactionValidationError
        >
    > {
        const validationResult = await this.aiValidator.validateAIResults(
            transaction,
            aiResult?.category,
            aiResult?.budget
        );

        if (!validationResult.ok) {
            return Result.err(validationResult.error);
        }

        const { category, budget } = validationResult.value;

        // Check if changes actually exist
        const hasChanges = this.validator.categoryOrBudgetChanged(transaction, category, budget);

        return Result.ok({ category, budget, hasChanges });
    }

    /**
     * Executes dry-run mode - displays proposed changes without applying
     */
    private executeDryRun(
        transaction: TransactionSplit,
        journalId: string,
        category?: CategoryProperties,
        budget?: BudgetRead
    ): Result<TransactionRead | undefined, TransactionValidationError> {
        logger.debug(
            {
                transactionId: journalId,
                description: transaction.description,
                proposedCategory: category?.name,
                proposedBudget: budget?.attributes.name,
            },
            'Dry run - showing proposed changes'
        );

        const transactionRead = this.transactionService.getTransactionReadBySplit(transaction);
        if (!transactionRead) {
            logger.warn(
                { transactionId: journalId, description: transaction.description },
                'Could not retrieve TransactionRead for dry-run display'
            );
        }

        return Result.ok(transactionRead);
    }

    /**
     * Executes interactive workflow with user prompts
     */
    private async executeInteractiveUpdate(
        transaction: TransactionSplit,
        category?: CategoryProperties,
        budget?: BudgetRead
    ): Promise<Result<TransactionRead | undefined, TransactionValidationError>> {
        const transactionRead = this.transactionService.getTransactionReadBySplit(transaction);
        if (!transactionRead) {
            return Result.err({
                field: 'transactionRead',
                message: 'Could not retrieve transaction details',
                userMessage: 'Unable to load transaction details for update',
                transactionId: transaction.transaction_journal_id || 'unknown',
                transactionDescription: transaction.description || 'No description',
            });
        }

        const workflowResult = await this.handleUpdateWorkflow(
            transaction,
            transactionRead,
            category,
            budget
        );

        if (!workflowResult.ok) {
            return Result.err(workflowResult.error);
        }

        return Result.ok(workflowResult.value);
    }

    /**
     * Handles the interactive update workflow with user prompts
     */
    private async handleUpdateWorkflow(
        transaction: TransactionSplit,
        transactionRead: TransactionRead,
        category?: CategoryProperties,
        budget?: BudgetRead
    ): Promise<Result<TransactionRead | undefined, TransactionValidationError>> {
        // Store original AI suggestions (immutable)
        const originalAISuggestion = {
            category: category,
            budget: budget,
        };

        let currentCategory = category;
        let currentBudget = budget;
        let action: CategorizeMode;

        do {
            action = await this.userInputService.askToUpdateTransaction(
                transaction,
                transactionRead.id,
                {
                    category: currentCategory?.name,
                    budget: currentBudget?.attributes.name,
                }
            );

            if (action === CategorizeMode.Skip) {
                logger.debug(
                    { description: transaction.description },
                    'User skipped transaction update'
                );
                return Result.ok(undefined);
            }

            if (action === CategorizeMode.Edit) {
                [currentCategory, currentBudget] = await this.processEditCommand(
                    transaction,
                    currentCategory,
                    currentBudget,
                    originalAISuggestion
                );
            }
        } while (action === CategorizeMode.Edit);

        // Apply the final update
        const updatedTransaction = await this.applyTransactionUpdate(
            transaction,
            action,
            currentCategory,
            currentBudget
        );

        return Result.ok(updatedTransaction);
    }

    /**
     * Handles edit mode workflow
     * Preserves current values for attributes not being edited
     */
    private async processEditCommand(
        transaction: TransactionSplit,
        currentCategory?: CategoryProperties,
        currentBudget?: BudgetRead,
        aiSuggestion?: {
            category?: CategoryProperties;
            budget?: BudgetRead;
        }
    ): Promise<[CategoryProperties | undefined, BudgetRead | undefined]> {
        logger.debug({ description: transaction.description }, 'User chose the edit option');

        const answers = await this.userInputService.shouldEditCategoryBudget();

        // Initialize with current values to preserve unedited attributes
        let newCategory: CategoryProperties | undefined = currentCategory;
        let newBudget: BudgetRead | undefined = currentBudget;

        for (const answer of answers) {
            if (answer === EditTransactionAttribute.Category) {
                const categoryNames = this.aiValidator.getAvailableCategoryNames();
                newCategory = await this.userInputService.getNewCategory(
                    categoryNames,
                    currentCategory?.name,
                    aiSuggestion?.category?.name
                );
            } else if (answer === EditTransactionAttribute.Budget) {
                const budgetNames = this.aiValidator.getAvailableBudgetNames();
                newBudget = await this.userInputService.getNewBudget(
                    budgetNames,
                    currentBudget?.attributes.name,
                    aiSuggestion?.budget?.attributes.name
                );
            }
        }

        if (newBudget && (!newBudget.id || newBudget.id === '')) {
            const resolvedBudget = this.aiValidator.getBudgetByName(newBudget.attributes.name);
            if (resolvedBudget) {
                newBudget = resolvedBudget;
                logger.debug(
                    { budgetName: newBudget.attributes.name, budgetId: resolvedBudget.id },
                    'Resolved user-selected budget to full object'
                );
            } else {
                logger.warn(
                    { budgetName: newBudget.attributes.name },
                    'Failed to resolve user-selected budget - budget may not exist'
                );
            }
        }

        return [newCategory, newBudget];
    }

    /**
     * Applies the final transaction update based on user selection
     */
    private async applyTransactionUpdate(
        transaction: TransactionSplit,
        mode: CategorizeMode,
        category?: CategoryProperties,
        budget?: BudgetRead
    ): Promise<TransactionRead | undefined> {
        const { categoryName, budgetId } = this.getUpdateParameters(mode, category, budget);
        return await this.transactionService.updateTransaction(transaction, categoryName, budgetId);
    }

    /**
     * Determines which parameters to update based on mode
     */
    private getUpdateParameters(
        mode: CategorizeMode,
        category?: CategoryProperties,
        budget?: BudgetRead
    ): { categoryName?: string; budgetId?: string } {
        switch (mode) {
            case CategorizeMode.Both:
                return { categoryName: category?.name, budgetId: budget?.id };
            case CategorizeMode.Budget:
                return { budgetId: budget?.id };
            case CategorizeMode.Category:
                return { categoryName: category?.name };
            default:
                return {};
        }
    }
}
