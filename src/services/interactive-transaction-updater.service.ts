import {
    TransactionSplit,
    CategoryProperties,
    BudgetRead,
    TransactionRead,
} from '@derekprovance/firefly-iii-sdk';
import { TransactionService } from './core/transaction.service.js';
import { ITransactionValidatorService } from './core/transaction-validator.service.interface.js';
import { TransactionAIResultValidator } from './core/transaction-ai-result-validator.service.js';
import { UserInputService } from './user-input.service.js';
import { Result, TransactionValidationError } from '../types/result.type.js';
import { logger } from '../logger.js';
import { ReviewAction } from '../types/enums.js';
import { EditTransactionAttribute } from '../types/enums.js';
import { AIResult } from './ai/llm-transaction-processing.service.js';

/** Position of a transaction in the review, shown to the user as `[index/total]` */
export interface ReviewProgress {
    index: number;
    total: number;
}

/** A validated suggestion that will change the transaction, ready to prompt for */
export interface PreparedUpdate {
    transaction: TransactionSplit;
    journalId: string;
    category?: CategoryProperties;
    budget?: BudgetRead;
    source?: AIResult['source'];
}

/**
 * Service for managing interactive transaction updates with AI-suggested categories and budgets.
 * Handles user workflow, validation, and dry-run mode.
 */
export class InteractiveTransactionUpdater {
    constructor(
        private readonly transactionService: TransactionService,
        private readonly validator: ITransactionValidatorService,
        private readonly aiValidator: TransactionAIResultValidator,
        private readonly userInputService: UserInputService,
        private readonly dryRun: boolean = false
    ) {}

    /**
     * Validates the suggestion for a transaction without prompting. Resolves
     * to `undefined` when there is nothing to change, so the caller can count
     * the prompts that will follow before showing the first one.
     */
    async prepareUpdate(
        transaction: TransactionSplit,
        aiResults: Record<string, AIResult>
    ): Promise<Result<PreparedUpdate | undefined, TransactionValidationError>> {
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

            return Result.ok({
                transaction,
                journalId,
                category,
                budget,
                source: aiResults[journalId]?.source,
            });
        } catch (error) {
            return Result.err(this.toUpdateError(transaction, journalId, error));
        }
    }

    /**
     * Shows a prepared update to the user (or reports it in dry-run mode) and
     * applies their decision.
     */
    async applyUpdate(
        update: PreparedUpdate,
        progress?: ReviewProgress
    ): Promise<Result<TransactionRead | undefined, TransactionValidationError>> {
        const { transaction, journalId, category, budget, source } = update;
        try {
            if (this.dryRun) {
                return this.executeDryRun(transaction, journalId, category, budget);
            }

            return await this.executeInteractiveUpdate(
                transaction,
                category,
                budget,
                source,
                progress
            );
        } catch (error) {
            return Result.err(this.toUpdateError(transaction, journalId, error));
        }
    }

    private toUpdateError(
        transaction: TransactionSplit,
        journalId: string,
        error: unknown
    ): TransactionValidationError {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(
            { description: transaction.description, error: err.message },
            'Error processing transaction'
        );

        return {
            field: 'unknown',
            message: err.message,
            userMessage: `Failed to update transaction: ${err.message}`,
            transactionId: journalId,
            transactionDescription: transaction.description || 'No description',
            details: { error: err },
        };
    }

    /**
     * Validates AI results and prepares update data
     */
    private async validateAndPrepareUpdate(
        transaction: TransactionSplit,
        aiResult?: AIResult
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
        budget?: BudgetRead,
        source?: AIResult['source'],
        progress?: ReviewProgress
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
            budget,
            source,
            progress
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
        budget?: BudgetRead,
        source?: AIResult['source'],
        progress?: ReviewProgress
    ): Promise<Result<TransactionRead | undefined, TransactionValidationError>> {
        // Once per transaction: an Edit re-prompts below without a new separator
        this.userInputService.printSeparator();

        // Store original AI suggestions (immutable)
        const originalAISuggestion = {
            category: category,
            budget: budget,
        };

        let currentCategory = category;
        let currentBudget = budget;
        let action: ReviewAction;

        do {
            action = await this.userInputService.askToUpdateTransaction(
                transaction,
                transactionRead.id,
                {
                    category: currentCategory?.name,
                    budget: currentBudget?.attributes.name,
                    // A label describes the suggestion, so it is dropped once
                    // the user edits that field to something else
                    source: {
                        ...(source?.category &&
                            currentCategory?.name === category?.name && {
                                category: source.category,
                            }),
                        ...(source?.budget &&
                            currentBudget?.attributes.name === budget?.attributes.name && {
                                budget: source.budget,
                            }),
                    },
                    progress,
                }
            );

            if (action === ReviewAction.Skip) {
                logger.debug(
                    { description: transaction.description },
                    'User skipped transaction update'
                );
                return Result.ok(undefined);
            }

            if (action === ReviewAction.Edit) {
                [currentCategory, currentBudget] = await this.processEditCommand(
                    transaction,
                    currentCategory,
                    currentBudget,
                    originalAISuggestion
                );
            }
        } while (action === ReviewAction.Edit);

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

        const isDeposit = transaction.type === 'deposit';
        const answers = await this.userInputService.shouldEditCategoryBudget(isDeposit);

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
        action: ReviewAction,
        category?: CategoryProperties,
        budget?: BudgetRead
    ): Promise<TransactionRead | undefined> {
        const { categoryName, budgetId } = this.getUpdateParameters(action, category, budget);
        return await this.transactionService.updateTransaction(transaction, categoryName, budgetId);
    }

    /**
     * Determines which parameters to update based on mode
     */
    private getUpdateParameters(
        action: ReviewAction,
        category?: CategoryProperties,
        budget?: BudgetRead
    ): { categoryName?: string; budgetId?: string } {
        switch (action) {
            case ReviewAction.UpdateAll:
                return { categoryName: category?.name, budgetId: budget?.id };
            case ReviewAction.UpdateBudget:
                return { budgetId: budget?.id };
            case ReviewAction.UpdateCategory:
                return { categoryName: category?.name };
            case ReviewAction.Edit:
            case ReviewAction.Skip:
                return {};
            default: {
                const unhandled: never = action;
                throw new Error(`Unhandled review action: ${String(unhandled)}`);
            }
        }
    }
}
