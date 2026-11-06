import { TransactionRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import ora from 'ora';
import { logger } from '../logger.js';
import { errorMessage } from '../utils/error-detection.utils.js';
import { TransactionService } from './core/transaction.service.js';
import { CategoryBudgetCatalog } from './core/category-budget-catalog.service.js';
import { LLMAssignmentService } from './ai/llm-assignment.service.js';
import { AssignmentType } from './ai/utils/prompt-templates.js';
import { CategorizeMode } from '../types/enums.js';
import { CategorizeStatusDto } from '../types/dto/categorize-status.dto.js';
import { CategorizeStatus } from '../types/enums.js';
import { ITransactionValidatorService } from './core/transaction-validator.service.interface.js';
import {
    InteractiveTransactionUpdater,
    PreparedUpdate,
} from './interactive-transaction-updater.service.js';
import { TransactionValidationError } from '../types/result.type.js';
import { TransactionHistoryService } from './transaction-history.service.js';
import { ReviewCancelledError } from './user-input.service.js';
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

export class AITransactionUpdateOrchestrator {
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

        const suggestions = await this.suggestWithSpinner(transactions, updateMode);
        const { prepared, invalid } = this.prepare(suggestions);
        const { updated, failed } = await this.review(prepared);

        logger.debug(
            {
                tag,
                updateMode,
                totalTransactions: transactions.length,
                updatedTransactions: updated.length,
                invalid: invalid.length,
                failed: failed.length,
            },
            'Transaction update complete'
        );

        return {
            status: CategorizeStatus.HAS_RESULTS,
            transactionsUpdated: updated.length,
            errors: [...invalid, ...failed],
        };
    }

    private async suggestWithSpinner(
        transactions: JournaledTransaction[],
        updateMode: CategorizeMode
    ): Promise<Suggestion[]> {
        const count = transactions.length;
        const spinner = ora(
            `Finding suggestions for ${count} transaction${count !== 1 ? 's' : ''}...`
        ).start();
        try {
            const suggestions = await this.suggest(transactions, updateMode);
            // Cleared without a summary: the prompts follow straight away
            spinner.stop();
            return suggestions;
        } catch (error) {
            spinner.fail('AI processing failed');
            throw error;
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

    /** Never rejects: a failed fetch is logged and the index stays empty */
    private async loadHistory(transactions: JournaledTransaction[]): Promise<void> {
        const own = new Set(transactions.map(t => t.transaction_journal_id));
        try {
            await this.history.load(own);
        } catch (error) {
            logger.warn(
                { error: errorMessage(error) },
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

    /**
     * Validates every suggestion before the first prompt, so the
     * `[index/total]` counter counts only the prompts actually shown.
     */
    private prepare(suggestions: Suggestion[]): {
        prepared: PreparedUpdate[];
        invalid: TransactionValidationError[];
    } {
        const prepared: PreparedUpdate[] = [];
        const invalid: TransactionValidationError[] = [];
        for (const suggestion of suggestions) {
            const result = this.interactiveTransactionUpdater.prepareUpdate(suggestion);
            if (!result.ok) {
                invalid.push(result.error);
            } else if (result.value) {
                prepared.push(result.value);
            }
        }
        return { prepared, invalid };
    }

    /** Shows each prepared update in turn and applies the user's decision */
    private async review(prepared: PreparedUpdate[]): Promise<{
        updated: TransactionRead[];
        failed: TransactionValidationError[];
    }> {
        const updated: TransactionRead[] = [];
        const failed: TransactionValidationError[] = [];
        for (const [i, update] of prepared.entries()) {
            let result;
            try {
                result = await this.interactiveTransactionUpdater.applyUpdate(update, {
                    index: i + 1,
                    total: prepared.length,
                });
            } catch (error) {
                if (error instanceof ReviewCancelledError) {
                    logger.debug('Review cancelled by the user');
                    break;
                }
                throw error;
            }
            if (!result.ok) {
                failed.push(result.error);
            } else if (result.value) {
                updated.push(result.value);
            }
        }
        return { updated, failed };
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
