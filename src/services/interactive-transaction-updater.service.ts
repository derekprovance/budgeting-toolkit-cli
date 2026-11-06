import { CategoryProperties, BudgetRead, TransactionRead } from '@derekprovance/firefly-iii-sdk';
import { TransactionService } from './core/transaction.service.js';
import { ITransactionValidatorService } from './core/transaction-validator.service.interface.js';
import { CategoryBudgetCatalog } from './core/category-budget-catalog.service.js';
import { ReviewCancelledError, UserInputService } from './user-input.service.js';
import { Result, TransactionValidationError } from '../types/result.type.js';
import { logger } from '../logger.js';
import { toError } from '../utils/error-detection.utils.js';
import { ReviewAction } from '../types/enums.js';
import { EditTransactionAttribute } from '../types/enums.js';
import {
    CategorizeOptions,
    JournaledTransaction,
    Suggestion,
    SuggestionSource,
} from '../types/categorize.types.js';

/** Position of a transaction in the review, shown to the user as `[index/total]` */
export interface ReviewProgress {
    index: number;
    total: number;
}

/** A validated suggestion that will change the transaction, ready to prompt for */
export interface PreparedUpdate {
    readonly transaction: JournaledTransaction;
    readonly category?: CategoryProperties;
    readonly budget?: BudgetRead;
    readonly source: Suggestion['source'];
}

interface Choice {
    category?: CategoryProperties;
    budget?: BudgetRead;
}

/**
 * Turns suggestions into updates: validates them up front, then shows each to
 * the user (or reports it in dry-run mode) and applies their decision.
 */
export class InteractiveTransactionUpdater {
    constructor(
        private readonly transactionService: TransactionService,
        private readonly validator: ITransactionValidatorService,
        private readonly catalog: CategoryBudgetCatalog,
        private readonly userInputService: UserInputService,
        private readonly options: CategorizeOptions
    ) {}

    /**
     * Validates a suggestion without prompting. Resolves to `undefined` when it
     * changes nothing, so the caller can count the prompts that will follow
     * before showing the first one.
     */
    prepareUpdate(
        suggestion: Suggestion
    ): Result<PreparedUpdate | undefined, TransactionValidationError> {
        const { transaction, source } = suggestion;
        const resolved = this.catalog.resolve(transaction, suggestion);
        if (!resolved.ok) {
            return Result.err(resolved.error);
        }

        const { category, budget } = resolved.value;
        if (!this.validator.categoryOrBudgetChanged(transaction, category, budget)) {
            logger.debug(
                { transactionId: transaction.transaction_journal_id },
                'No changes detected for transaction'
            );
            return Result.ok(undefined);
        }
        return Result.ok({ transaction, category, budget, source });
    }

    /**
     * Shows a prepared update to the user and applies their decision; in
     * dry-run mode only returns the transaction. Resolves to `undefined` when
     * the user skips it, and to an error when it cannot be applied.
     *
     * @throws ReviewCancelledError when the user ends the review
     */
    async applyUpdate(
        update: PreparedUpdate,
        progress: ReviewProgress
    ): Promise<Result<TransactionRead | undefined, TransactionValidationError>> {
        if (this.options.dryRun) {
            return Result.ok(this.transactionService.getTransactionReadBySplit(update.transaction));
        }
        try {
            return Result.ok(await this.review(update, progress));
        } catch (error) {
            if (error instanceof ReviewCancelledError) {
                throw error;
            }
            return Result.err(this.toUpdateError(update.transaction, error));
        }
    }

    private async review(
        update: PreparedUpdate,
        progress: ReviewProgress
    ): Promise<TransactionRead | undefined> {
        const { transaction } = update;
        const { id: transactionId } = this.findTransactionRead(transaction);
        const canSetBudget = this.validator.shouldSetBudget(transaction);
        // Once per transaction: an Edit re-prompts below without a new separator
        this.userInputService.printSeparator();

        let choice: Choice = { category: update.category, budget: update.budget };
        for (;;) {
            const action = await this.userInputService.askToUpdateTransaction(
                transaction,
                transactionId,
                {
                    canSetBudget,
                    category: choice.category?.name,
                    budget: choice.budget?.attributes.name,
                    source: this.sourceOf(update, choice),
                    progress,
                }
            );

            switch (action) {
                case ReviewAction.Skip:
                    return undefined;
                case ReviewAction.Edit:
                    choice = await this.edit(update, choice, canSetBudget);
                    break;
                case ReviewAction.UpdateAll:
                    return this.apply(transaction, choice);
                case ReviewAction.UpdateCategory:
                    return this.apply(transaction, { category: choice.category });
                case ReviewAction.UpdateBudget:
                    return this.apply(transaction, { budget: choice.budget });
                default: {
                    const unhandled: never = action;
                    throw new Error(`Unhandled review action: ${String(unhandled)}`);
                }
            }
        }
    }

    /** A label describes the suggestion, so it is dropped once the user edits that field */
    private sourceOf(
        update: PreparedUpdate,
        choice: Choice
    ): { category?: SuggestionSource; budget?: SuggestionSource } {
        return {
            ...(update.source.category &&
                choice.category?.name === update.category?.name && {
                    category: update.source.category,
                }),
            ...(update.source.budget &&
                choice.budget?.attributes.name === update.budget?.attributes.name && {
                    budget: update.source.budget,
                }),
        };
    }

    /** Asks which fields to change and for their new values; keeps the rest */
    private async edit(
        update: PreparedUpdate,
        choice: Choice,
        canSetBudget: boolean
    ): Promise<Choice> {
        const fields = await this.userInputService.shouldEditCategoryBudget(canSetBudget);

        const edited = { ...choice };
        for (const field of fields) {
            switch (field) {
                case EditTransactionAttribute.Category:
                    edited.category = this.catalog.findCategory(
                        await this.userInputService.getNewCategory(
                            this.catalog.categoryNames(),
                            choice.category?.name,
                            update.category?.name
                        )
                    );
                    break;
                case EditTransactionAttribute.Budget:
                    edited.budget = this.catalog.findBudget(
                        await this.userInputService.getNewBudget(
                            this.catalog.budgetNames(),
                            choice.budget?.attributes.name,
                            update.budget?.attributes.name
                        )
                    );
                    break;
                default: {
                    const unhandled: never = field;
                    throw new Error(`Unhandled edit attribute: ${String(unhandled)}`);
                }
            }
        }
        return edited;
    }

    private apply(transaction: JournaledTransaction, choice: Choice): Promise<TransactionRead> {
        return this.transactionService.updateTransaction(
            transaction,
            choice.category?.name,
            choice.budget?.id
        );
    }

    private findTransactionRead(transaction: JournaledTransaction): TransactionRead {
        const transactionRead = this.transactionService.getTransactionReadBySplit(transaction);
        if (!transactionRead) {
            throw new Error(
                `Could not retrieve transaction details for journal ${transaction.transaction_journal_id}`
            );
        }
        return transactionRead;
    }

    private toUpdateError(
        transaction: JournaledTransaction,
        error: unknown
    ): TransactionValidationError {
        const err = toError(error);
        logger.error(
            { description: transaction.description, error: err.message },
            'Error processing transaction'
        );

        return {
            field: 'unknown',
            message: err.message,
            userMessage: `Failed to update transaction: ${err.message}`,
            transactionId: transaction.transaction_journal_id,
            transactionDescription: transaction.description || 'No description',
            details: { error: err },
        };
    }
}
