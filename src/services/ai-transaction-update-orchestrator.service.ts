import { TransactionRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import ora from 'ora';
import { logger } from '../logger.js';
import { TransactionService } from './core/transaction.service.js';
import { CategoryBudgetCatalog } from './core/category-budget-catalog.service.js';
import { LLMAssignmentService } from './ai/llm-assignment.service.js';
import { AssignmentType } from './ai/utils/prompt-templates.js';
import { CategorizeMode } from '../types/enums.js';
import { CategorizeStatusDto } from '../types/dto/categorize-status.dto.js';
import { CategorizeStatus } from '../types/enums.js';
import { IAITransactionUpdateOrchestrator } from '../types/interface/ai-transaction-update-orchestrator.service.interface.js';
import { ITransactionValidatorService } from './core/transaction-validator.service.interface.js';
import {
    InteractiveTransactionUpdater,
    PreparedUpdate,
} from './interactive-transaction-updater.service.js';
import { TransactionValidationError } from '../types/result.type.js';
import { isCertificateError } from '../utils/error-detection.utils.js';
import { TransactionHistoryService } from './transaction-history.service.js';
import {
    CategorizeOptions,
    JournaledTransaction,
    Suggestion,
    hasJournalId,
} from '../types/categorize.types.js';

interface SuggestionCounts {
    category: { history: number; ai: number };
    budget: { history: number; ai: number };
}

interface TransactionError {
    transaction: TransactionSplit;
    error: TransactionValidationError;
}

export class AITransactionUpdateOrchestrator implements IAITransactionUpdateOrchestrator {
    constructor(
        private readonly transactionService: TransactionService,
        private readonly interactiveTransactionUpdater: InteractiveTransactionUpdater,
        private readonly catalog: CategoryBudgetCatalog,
        private readonly llm: LLMAssignmentService,
        private readonly validator: ITransactionValidatorService,
        private readonly history: TransactionHistoryService,
        private readonly options: CategorizeOptions
    ) {}

    async updateTransactionsByTag(
        tag: string,
        updateMode: CategorizeMode
    ): Promise<CategorizeStatusDto> {
        try {
            if (!(await this.transactionService.tagExists(tag))) {
                logger.debug(
                    {
                        tag,
                        updateMode,
                    },
                    'Tag does not exist'
                );
                return {
                    status: CategorizeStatus.NO_TAG,
                    transactionsUpdated: 0,
                };
            }

            const unfilteredTransactions = await this.transactionService.getTransactionsByTag(tag);

            const transactions = unfilteredTransactions
                .filter(t => this.validator.shouldProcessTransaction(t, this.options.force))
                .filter(t => this.isUpdatable(t));

            if (!transactions.length) {
                logger.debug(
                    {
                        tag,
                        updateMode,
                        totalTransactions: unfilteredTransactions.length,
                        filteredTransactions: transactions.length,
                    },
                    'No valid transactions found for tag'
                );
                return {
                    status: CategorizeStatus.EMPTY_TAG,
                    transactionsUpdated: 0,
                };
            }

            logger.debug(
                {
                    tag,
                    updateMode,
                    totalTransactions: transactions.length,
                },
                'Processing transactions'
            );

            // Show spinner while history and the AI produce suggestions
            const spinner = ora(
                `Finding suggestions for ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}...`
            ).start();

            try {
                const aiResults = await this.getAIResultsForTransactions(transactions, updateMode);

                // Cleared without a summary: the prompts follow straight away
                spinner.stop();

                const { updatedTransactions, errors } = await this.updateTransactionsWithAIResults(
                    transactions,
                    aiResults
                );

                // Display validation errors to user
                if (errors.length > 0) {
                    this.displayValidationErrors(errors);
                }

                logger.debug(
                    {
                        tag,
                        updateMode,
                        totalTransactions: transactions.length,
                        updatedTransactions: updatedTransactions.length,
                        validationErrors: errors.length,
                    },
                    'Transaction update complete'
                );

                return {
                    status: CategorizeStatus.HAS_RESULTS,
                    transactionsUpdated: updatedTransactions.length,
                    transactionErrors: errors.length,
                };
            } catch (aiError) {
                spinner.fail('AI processing failed');
                throw aiError;
            }
        } catch (ex) {
            // Re-throw certificate/network errors so the command layer can display
            // actionable remediation guidance with the full error context
            if (isCertificateError(ex)) {
                throw ex;
            }

            logger.error(
                {
                    tag,
                    updateMode,
                    error: ex instanceof Error ? ex.message : 'Unknown error',
                },
                'Failed to update transactions'
            );

            return {
                status: CategorizeStatus.PROCESSING_FAILED,
                transactionsUpdated: 0,
                error:
                    ex instanceof Error
                        ? ex.message
                        : 'Unknown error occurred while processing transactions',
            };
        }
    }

    /** Firefly can only key and update a split with a journal id */
    private isUpdatable(transaction: TransactionSplit): transaction is JournaledTransaction {
        if (!hasJournalId(transaction)) {
            logger.warn(
                { description: transaction.description },
                'Skipping transaction without transaction_journal_id'
            );
            return false;
        }
        return true;
    }

    /**
     * Builds the history index for `transactions`. History is an optimisation
     * over the AI, so a failed fetch only costs its suggestions: it is logged
     * and the index stays empty. Never rejects.
     */
    private async loadHistory(transactions: JournaledTransaction[]): Promise<void> {
        const own = new Set(transactions.map(t => t.transaction_journal_id));
        try {
            await this.history.load(own);
        } catch (error) {
            logger.warn(
                { error: error instanceof Error ? error.message : String(error) },
                'Transaction history unavailable; every suggestion will come from the AI'
            );
        }
    }

    private async getAIResultsForTransactions(
        transactions: JournaledTransaction[],
        updateMode: CategorizeMode
    ): Promise<Record<string, Suggestion>> {
        const categoryNames =
            updateMode !== CategorizeMode.Budget ? this.catalog.categoryNames() : undefined;
        const budgetNames =
            updateMode !== CategorizeMode.Category ? this.catalog.budgetNames() : undefined;

        logger.debug(
            {
                updateMode,
                transactionCount: transactions.length,
                categoryCount: categoryNames?.length,
                budgetCount: budgetNames?.length,
            },
            'Getting AI results for transactions'
        );

        // Group B: has category, no budget — budget assignment only
        const budgetOnlySet = new Set(
            this.options.force
                ? []
                : transactions.filter(t => this.validator.isBudgetOnlyCandidate(t))
        );

        await this.loadHistory(transactions);

        const results: Record<string, Suggestion> = {};
        const counts: SuggestionCounts = {
            category: { history: 0, ai: 0 },
            budget: { history: 0, ai: 0 },
        };
        const needsCategory: JournaledTransaction[] = [];
        const needsBudget: JournaledTransaction[] = [];

        for (const t of transactions) {
            // Group A gets every field the mode asks for. Group B keeps its
            // category, and category mode leaves it alone entirely
            const isBudgetOnly = budgetOnlySet.has(t);
            const wantsCategory = !!categoryNames && !isBudgetOnly;
            // The validator's rule: never a deposit (Firefly drops the budget,
            // VERIFICATION.md V8), a bill-linked or a disposable-income one
            const wantsBudget = !!budgetNames && this.validator.shouldSetBudget(t);
            if (!wantsCategory && !wantsBudget) {
                continue;
            }

            // A history value is only used while it still names an existing
            // category or budget; otherwise the field falls through to the AI
            const suggestion = this.history.suggest(t);
            const category = wantsCategory
                ? this.catalog.findCategory(suggestion?.category)?.name
                : undefined;
            const budget = wantsBudget
                ? this.catalog.findBudget(suggestion?.budget)?.attributes.name
                : undefined;
            // A match that was deliberately left unbudgeted last time is the
            // answer: keep it unbudgeted rather than asking the AI for one
            const keptUnbudgeted = wantsBudget && suggestion?.budget === null;

            const missingCategory = wantsCategory && !category;
            const missingBudget = wantsBudget && !budget && !keptUnbudgeted;

            if (wantsCategory) counts.category[missingCategory ? 'ai' : 'history']++;
            if (wantsBudget) counts.budget[missingBudget ? 'ai' : 'history']++;

            if (!category && !budget && !missingCategory && !missingBudget) {
                // Nothing to suggest and nothing left to ask
                continue;
            }

            results[t.transaction_journal_id] = {
                transaction: t,
                ...(category && { category }),
                ...(budget && { budget }),
                source: {
                    ...(category && { category: 'history' as const }),
                    ...(budget && { budget: 'history' as const }),
                },
            };

            if (missingCategory) needsCategory.push(t);
            if (missingBudget) needsBudget.push(t);
        }

        const aiCategories = await this.askAI('category', needsCategory, categoryNames);
        for (const [t, category] of aiCategories) {
            const entry = results[t.transaction_journal_id];
            entry.category = category;
            entry.source = { ...entry.source, category: 'ai' };
        }
        const aiBudgets = await this.askAI('budget', needsBudget, budgetNames);
        for (const [t, budget] of aiBudgets) {
            const entry = results[t.transaction_journal_id];
            entry.budget = budget;
            entry.source = { ...entry.source, budget: 'ai' };
        }

        logger.debug(counts, 'Suggestions resolved');

        return results;
    }

    /** The AI's answer for each of `transactions` it found a match for */
    private async askAI(
        type: AssignmentType,
        transactions: JournaledTransaction[],
        options: string[] | undefined
    ): Promise<Map<JournaledTransaction, string>> {
        if (!transactions.length || !options?.length) {
            return new Map();
        }
        const answers = await this.llm.assign(type, transactions, options);
        return new Map(
            transactions.flatMap((t, i) => {
                const answer = answers[i];
                return answer ? [[t, answer] as const] : [];
            })
        );
    }

    private async updateTransactionsWithAIResults(
        transactions: JournaledTransaction[],
        aiResults: Record<string, Suggestion>
    ): Promise<{ updatedTransactions: TransactionRead[]; errors: TransactionError[] }> {
        logger.debug({ count: transactions.length }, 'START updateTransactionsWithAIResults');
        const results: TransactionRead[] = [];
        const errors: TransactionError[] = [];

        try {
            // Every suggestion is validated before the first prompt, so the
            // `[index/total]` counter counts exactly the prompts that follow:
            // a suggestion that fails validation or changes nothing never
            // reaches the user and must not take a number
            const prepared: PreparedUpdate[] = [];
            for (const transaction of transactions) {
                const suggestion = aiResults[transaction.transaction_journal_id];
                if (!suggestion) {
                    continue;
                }

                const prepareResult = this.interactiveTransactionUpdater.prepareUpdate(suggestion);
                if (!prepareResult.ok) {
                    errors.push({ transaction, error: prepareResult.error });
                } else if (prepareResult.value) {
                    prepared.push(prepareResult.value);
                }
            }

            for (const [i, update] of prepared.entries()) {
                const updateResult = await this.interactiveTransactionUpdater.applyUpdate(update, {
                    index: i + 1,
                    total: prepared.length,
                });

                if (updateResult.ok) {
                    if (updateResult.value) {
                        results.push(updateResult.value);
                    }
                } else if (updateResult.error) {
                    errors.push({
                        transaction: update.transaction,
                        error: updateResult.error,
                    });

                    if (updateResult.error.message.includes('SIGINT')) {
                        logger.debug(
                            update.transaction,
                            'Transaction update(s) terminated with SIGINT'
                        );
                        break;
                    }
                }
            }

            const totalTransactions = transactions.length;
            const updatedCount = results.length;
            const errorCount = errors.length;
            const skippedCount = totalTransactions - updatedCount - errorCount;

            logger.debug(
                {
                    totalTransactions,
                    updated: updatedCount,
                    skipped: skippedCount,
                    validationErrors: errorCount,
                },
                'Transaction update completed'
            );

            if (errorCount > 0) {
                logger.warn(
                    {
                        errorCount,
                        errors: errors.map(e => ({
                            description: e.transaction.description,
                            field: e.error?.field,
                            message: e.error?.message,
                        })),
                    },
                    'Some transactions failed validation'
                );
            }

            return { updatedTransactions: results, errors };
        } catch (err) {
            logger.error(
                { error: err instanceof Error ? err.message : err },
                'ERROR in updateTransactionsWithAIResults'
            );
            throw err;
        }
    }

    /**
     * Displays user-friendly validation error messages
     */
    private displayValidationErrors(errors: TransactionError[]): void {
        if (errors.length === 0) return;

        console.error(`\n⚠️  ${errors.length} transaction(s) failed validation:\n`);

        for (const { transaction, error } of errors) {
            console.error(`  • ${transaction.description || 'Unknown transaction'}`);
            console.error(`    ${error.userMessage}`);
            if (error.details?.suggestedCategory || error.details?.suggestedBudget) {
                const suggested = error.details.suggestedCategory || error.details.suggestedBudget;
                console.error(`    Suggested: "${suggested}"`);
            }
            console.error('');
        }

        console.error('Please check your categories and budgets in Firefly III.');
    }
}
