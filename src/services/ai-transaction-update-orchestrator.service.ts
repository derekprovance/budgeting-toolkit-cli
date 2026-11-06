import {
    BudgetRead,
    CategoryProperties,
    TransactionRead,
    TransactionSplit,
} from '@derekprovance/firefly-iii-sdk';
import ora from 'ora';
import { logger } from '../logger.js';
import { ICategoryService } from './core/category.service.interface.js';
import { TransactionService } from './core/transaction.service.js';
import { IBudgetService } from './core/budget.service.interface.js';
import {
    AIResponse,
    LLMTransactionProcessingService,
} from './ai/llm-transaction-processing.service.js';
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
import { JournaledTransaction, hasJournalId } from '../types/categorize.types.js';

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
        private readonly categoryService: ICategoryService,
        private readonly budgetService: IBudgetService,
        private readonly llmService: LLMTransactionProcessingService,
        private readonly validator: ITransactionValidatorService,
        private readonly force: boolean = false,
        private readonly dryRun: boolean = false,
        private readonly history?: TransactionHistoryService
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
                        dryRun: this.dryRun,
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
                .filter(t => this.validator.shouldProcessTransaction(t, this.force))
                .filter(t => this.isUpdatable(t));

            if (!transactions.length) {
                logger.debug(
                    {
                        tag,
                        updateMode,
                        dryRun: this.dryRun,
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
                    dryRun: this.dryRun,
                    totalTransactions: transactions.length,
                },
                'Processing transactions'
            );

            // History spans up to years of transactions, so it is fetched
            // alongside the category and budget lists rather than after them
            const historyReady = this.loadHistory(transactions);

            let categories: CategoryProperties[] | undefined;
            if (updateMode !== CategorizeMode.Budget) {
                categories = await this.categoryService.getCategories();
            }

            let budgets: BudgetRead[] | undefined;
            if (updateMode !== CategorizeMode.Category) {
                budgets = await this.budgetService.getBudgets();
            }

            // Show spinner while history and the AI produce suggestions
            const spinner = ora(
                `Finding suggestions for ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}...`
            ).start();

            try {
                const aiResults = await this.getAIResultsForTransactions(
                    transactions,
                    updateMode,
                    categories,
                    budgets,
                    historyReady
                );

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
                        dryRun: this.dryRun,
                        totalTransactions: transactions.length,
                        updatedTransactions: updatedTransactions.length,
                        validationErrors: errors.length,
                        categories: categories?.length,
                        budgets: budgets?.length,
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
                    dryRun: this.dryRun,
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
        if (!this.history) {
            return;
        }
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
        updateMode: CategorizeMode,
        categories?: CategoryProperties[],
        budgets?: BudgetRead[],
        historyReady: Promise<void> = this.loadHistory(transactions)
    ): Promise<AIResponse> {
        // The no-match sentinel is handled inside LLMAssignmentService — plain
        // option lists are all that's needed here
        const categoryNames = categories?.map(c => c.name);
        const budgetNames = budgets?.map(b => b.attributes.name);

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
            this.force ? [] : transactions.filter(t => this.validator.isBudgetOnlyCandidate(t))
        );

        await historyReady;

        const results: AIResponse = {};
        const counts: SuggestionCounts = {
            category: { history: 0, ai: 0 },
            budget: { history: 0, ai: 0 },
        };
        const needsBoth: JournaledTransaction[] = [];
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
            const suggestion = this.history?.suggest(t);
            const category = wantsCategory
                ? TransactionHistoryService.resolveName(suggestion?.category, categoryNames)
                : undefined;
            const budget = wantsBudget
                ? TransactionHistoryService.resolveName(suggestion?.budget, budgetNames)
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
                ...(category && { category }),
                ...(budget && { budget }),
                source: {
                    ...(category && { category: 'history' as const }),
                    ...(budget && { budget: 'history' as const }),
                },
            };

            if (missingCategory && missingBudget) needsBoth.push(t);
            else if (missingCategory) needsCategory.push(t);
            else if (missingBudget) needsBudget.push(t);
        }

        const aiCalls: Array<[JournaledTransaction[], string[] | undefined, string[] | undefined]> =
            [
                [needsBoth, categoryNames, budgetNames],
                [needsCategory, categoryNames, undefined],
                [needsBudget, undefined, budgetNames],
            ];

        for (const [batch, categoryOptions, budgetOptions] of aiCalls) {
            if (batch.length === 0) {
                continue;
            }

            const aiResults = await this.llmService.processTransactions(
                batch,
                categoryOptions,
                budgetOptions
            );

            if (Object.keys(aiResults).length !== batch.length) {
                const error = new Error(
                    `LLM categorization result count (${
                        Object.keys(aiResults).length
                    }) doesn't match transaction count (${batch.length})`
                );
                logger.error(
                    {
                        expectedCount: batch.length,
                        actualCount: Object.keys(aiResults).length,
                    },
                    'AI result count mismatch'
                );
                throw error;
            }

            for (const t of batch) {
                const ai = aiResults[t.transaction_journal_id] ?? {};
                const entry = results[t.transaction_journal_id];
                if (!entry) {
                    continue;
                }
                if (categoryOptions && ai.category) {
                    entry.category = ai.category;
                    entry.source = { ...entry.source, category: 'ai' };
                }
                if (budgetOptions && ai.budget) {
                    entry.budget = ai.budget;
                    entry.source = { ...entry.source, budget: 'ai' };
                }
            }
        }

        logger.debug(counts, 'Suggestions resolved');

        return results;
    }

    private async updateTransactionsWithAIResults(
        transactions: JournaledTransaction[],
        aiResults: AIResponse
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
                if (!aiResults[transaction.transaction_journal_id]) {
                    logger.debug(
                        { description: transaction.description },
                        'No AI results for transaction:'
                    );
                    continue;
                }

                const prepareResult = await this.interactiveTransactionUpdater.prepareUpdate(
                    transaction,
                    aiResults
                );
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
                `${this.dryRun ? '[DRYRUN] ' : ''}Transaction update completed`
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
