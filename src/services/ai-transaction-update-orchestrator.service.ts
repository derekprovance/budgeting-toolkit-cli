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
import { TransactionHistoryService } from './transaction-history.service.js';
import {
    CategorizeOptions,
    JournaledTransaction,
    Suggestion,
    SuggestionSource,
    hasJournalId,
} from '../types/categorize.types.js';

/** What one transaction needs once history has answered what it can */
interface SuggestionPlan {
    readonly transaction: JournaledTransaction;
    /** History values that still name an existing category or budget */
    readonly remembered: { readonly category?: string; readonly budget?: string };
    readonly askAI: { readonly category: boolean; readonly budget: boolean };
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
        if (!(await this.transactionService.tagExists(tag))) {
            logger.debug(
                {
                    tag,
                    updateMode,
                },
                'Tag does not exist'
            );
            return { status: CategorizeStatus.NO_TAG, transactionsUpdated: 0, errors: [] };
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
            return { status: CategorizeStatus.EMPTY_TAG, transactionsUpdated: 0, errors: [] };
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
            const suggestions = await this.suggest(transactions, updateMode);

            // Cleared without a summary: the prompts follow straight away
            spinner.stop();

            const { updatedTransactions, errors } =
                await this.updateTransactionsWithAIResults(suggestions);

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
                errors,
            };
        } catch (aiError) {
            spinner.fail('AI processing failed');
            throw aiError;
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

    /** Suggestions for `transactions`: from history where it can, else from the AI */
    private async suggest(
        transactions: JournaledTransaction[],
        updateMode: CategorizeMode
    ): Promise<Suggestion[]> {
        await this.loadHistory(transactions);
        const plans = transactions.flatMap(t => this.plan(t, updateMode) ?? []);
        const aiCategories = await this.askAI(
            'category',
            plans.filter(p => p.askAI.category).map(p => p.transaction)
        );
        const aiBudgets = await this.askAI(
            'budget',
            plans.filter(p => p.askAI.budget).map(p => p.transaction)
        );
        return plans.flatMap(
            p =>
                mergeSuggestion(p, aiCategories.get(p.transaction), aiBudgets.get(p.transaction)) ??
                []
        );
    }

    /** Which fields `transaction` needs, what history says, and what is left for the AI */
    private plan(
        transaction: JournaledTransaction,
        updateMode: CategorizeMode
    ): SuggestionPlan | undefined {
        // A transaction that has a category but no budget keeps its category
        // unless --force; category mode leaves it alone entirely
        const wantsCategory =
            updateMode !== CategorizeMode.Budget &&
            (this.options.force || !this.validator.isBudgetOnlyCandidate(transaction));
        // The validator's rule: never a deposit (Firefly drops the budget,
        // VERIFICATION.md V8), a bill-linked or a disposable-income one
        const wantsBudget =
            updateMode !== CategorizeMode.Category && this.validator.shouldSetBudget(transaction);
        if (!wantsCategory && !wantsBudget) {
            return undefined;
        }

        // A history value is only used while it still names an existing
        // category or budget; otherwise the field falls through to the AI
        const remembered = this.history.suggest(transaction);
        const category = wantsCategory
            ? this.catalog.findCategory(remembered?.category)?.name
            : undefined;
        const budget = wantsBudget
            ? this.catalog.findBudget(remembered?.budget)?.attributes.name
            : undefined;
        // A match that was deliberately left unbudgeted last time is the
        // answer: keep it unbudgeted rather than asking the AI for one
        const keptUnbudgeted = remembered?.budget === null;

        return {
            transaction,
            remembered: { category, budget },
            askAI: {
                category: wantsCategory && !category,
                budget: wantsBudget && !budget && !keptUnbudgeted,
            },
        };
    }

    /** The AI's answer for each of `transactions` it found a match for */
    private async askAI(
        type: AssignmentType,
        transactions: JournaledTransaction[]
    ): Promise<Map<JournaledTransaction, string>> {
        const options =
            type === 'category' ? this.catalog.categoryNames() : this.catalog.budgetNames();
        if (!transactions.length || !options.length) {
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
        suggestions: Suggestion[]
    ): Promise<{ updatedTransactions: TransactionRead[]; errors: TransactionValidationError[] }> {
        const results: TransactionRead[] = [];
        const errors: TransactionValidationError[] = [];

        try {
            // Every suggestion is validated before the first prompt, so the
            // `[index/total]` counter counts exactly the prompts that follow:
            // a suggestion that fails validation or changes nothing never
            // reaches the user and must not take a number
            const prepared: PreparedUpdate[] = [];
            for (const suggestion of suggestions) {
                const prepareResult = this.interactiveTransactionUpdater.prepareUpdate(suggestion);
                if (!prepareResult.ok) {
                    errors.push(prepareResult.error);
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
                    errors.push(updateResult.error);

                    if (updateResult.error.message.includes('SIGINT')) {
                        logger.debug(
                            update.transaction,
                            'Transaction update(s) terminated with SIGINT'
                        );
                        break;
                    }
                }
            }

            const totalTransactions = suggestions.length;
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
                            description: e.transactionDescription,
                            field: e.field,
                            message: e.message,
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
}

/**
 * One transaction's suggestion: each field from history when it has a value,
 * else from the AI. Undefined when neither suggests anything.
 */
function mergeSuggestion(
    plan: SuggestionPlan,
    aiCategory: string | undefined,
    aiBudget: string | undefined
): Suggestion | undefined {
    const category = pickSource(plan.remembered.category, aiCategory);
    const budget = pickSource(plan.remembered.budget, aiBudget);
    if (!category && !budget) {
        return undefined;
    }
    return {
        transaction: plan.transaction,
        ...(category && { category: category.name }),
        ...(budget && { budget: budget.name }),
        source: {
            ...(category && { category: category.source }),
            ...(budget && { budget: budget.source }),
        },
    };
}

function pickSource(
    remembered: string | undefined,
    ai: string | undefined
): { name: string; source: SuggestionSource } | undefined {
    if (remembered) return { name: remembered, source: 'history' };
    if (ai) return { name: ai, source: 'ai' };
    return undefined;
}
