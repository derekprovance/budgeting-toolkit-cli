import {
    BudgetRead,
    CategoryProperties,
    TransactionRead,
    TransactionSplit,
} from '@derekprovance/firefly-iii-sdk';
import ora from 'ora';
import { logger } from '../logger.js';
import { CategoryService } from './core/category.service.js';
import { TransactionService } from './core/transaction.service.js';
import { BudgetService } from './core/budget.service.js';
import { TransactionAIResultValidator } from './core/transaction-ai-result-validator.service.js';
import {
    AIResponse,
    LLMTransactionProcessingService,
} from './ai/llm-transaction-processing.service.js';
import { CategorizeMode } from '../types/enums.js';
import { CategorizeStatusDto } from '../types/dto/categorize-status.dto.js';
import { CategorizeStatus } from '../types/enums.js';
import { IAITransactionUpdateOrchestrator } from '../types/interface/ai-transaction-update-orchestrator.service.interface.js';
import { TransactionValidatorService } from './core/transaction-validator.service.js';
import { InteractiveTransactionUpdater } from './interactive-transaction-updater.service.js';
import { TransactionValidationError } from '../types/result.type.js';

interface TransactionError {
    transaction: TransactionSplit;
    error: TransactionValidationError;
}

export class AITransactionUpdateOrchestrator implements IAITransactionUpdateOrchestrator {
    constructor(
        private readonly transactionService: TransactionService,
        private readonly interactiveTransactionUpdater: InteractiveTransactionUpdater,
        private readonly categoryService: CategoryService,
        private readonly budgetService: BudgetService,
        private readonly aiValidator: TransactionAIResultValidator,
        private readonly llmService: LLMTransactionProcessingService,
        private readonly validator: TransactionValidatorService,
        private readonly processTransactionsWithCategories: boolean = false
    ) {}

    async updateTransactionsByTag(
        tag: string,
        updateMode: CategorizeMode,
        dryRun?: boolean
    ): Promise<CategorizeStatusDto> {
        try {
            if (!(await this.transactionService.tagExists(tag))) {
                logger.debug(
                    {
                        tag,
                        updateMode,
                        dryRun,
                    },
                    'Tag does not exist'
                );
                return {
                    status: CategorizeStatus.NO_TAG,
                    transactionsUpdated: 0,
                };
            }

            const unfilteredTransactions = await this.transactionService.getTransactionsByTag(tag);

            const transactions = unfilteredTransactions.filter(t =>
                this.validator.shouldProcessTransaction(t, this.processTransactionsWithCategories)
            );

            if (!transactions.length) {
                logger.debug(
                    {
                        tag,
                        updateMode,
                        dryRun,
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
                    dryRun,
                    totalTransactions: transactions.length,
                },
                'Processing transactions'
            );

            // Initialize validator with fresh data
            await this.aiValidator.initialize();

            let categories: CategoryProperties[] | undefined;
            if (updateMode !== CategorizeMode.Budget) {
                categories = await this.categoryService.getCategories();
            }

            let budgets: BudgetRead[] | undefined;
            if (updateMode !== CategorizeMode.Category) {
                budgets = await this.budgetService.getBudgets();
            }

            // Show spinner during AI processing
            const spinner = ora(
                `Processing ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} with AI...`
            ).start();

            try {
                const aiResults = await this.getAIResultsForTransactions(
                    transactions,
                    updateMode,
                    categories,
                    budgets
                );

                spinner.succeed(
                    `AI processing complete (${transactions.length} transaction${transactions.length !== 1 ? 's' : ''})`
                );

                const { updatedTransactions, errors } = await this.updateTransactionsWithAIResults(
                    transactions,
                    aiResults,
                    dryRun
                );

                // Display validation errors to user
                if (errors.length > 0) {
                    this.displayValidationErrors(errors);
                }

                logger.debug(
                    {
                        tag,
                        updateMode,
                        dryRun,
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
            logger.error(
                {
                    tag,
                    updateMode,
                    dryRun,
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

    private async getAIResultsForTransactions(
        transactions: TransactionSplit[],
        updateMode: CategorizeMode,
        categories?: CategoryProperties[],
        budgets?: BudgetRead[]
    ): Promise<AIResponse> {
        const categoryNames = categories?.map(c => c.name);
        if (categoryNames) {
            categoryNames.push('(no category)');
        }

        const budgetNames = budgets?.map(b => b.attributes.name);
        if (budgetNames) {
            budgetNames.push('(no budget)');
        }

        logger.debug(
            {
                updateMode,
                transactionCount: transactions.length,
                categoryCount: categoryNames?.length,
                budgetCount: budgetNames?.length,
            },
            'Getting AI results for transactions'
        );

        const aiResults = await this.llmService.processTransactions(
            transactions,
            updateMode !== CategorizeMode.Budget ? categoryNames : undefined,
            updateMode !== CategorizeMode.Category ? budgetNames : undefined
        );

        if (Object.keys(aiResults).length !== transactions.length) {
            const error = new Error(
                `LLM categorization result count (${
                    Object.keys(aiResults).length
                }) doesn't match transaction count (${transactions.length})`
            );
            logger.error(
                {
                    expectedCount: transactions.length,
                    actualCount: Object.keys(aiResults).length,
                },
                'AI result count mismatch'
            );
            throw error;
        }

        return aiResults;
    }

    private async updateTransactionsWithAIResults(
        transactions: TransactionSplit[],
        aiResults: Record<string, { category?: string; budget?: string }>,
        dryRun: boolean | undefined
    ): Promise<{ updatedTransactions: TransactionRead[]; errors: TransactionError[] }> {
        logger.debug({ count: transactions.length }, 'START updateTransactionsWithAIResults');
        const results: TransactionRead[] = [];
        const errors: TransactionError[] = [];

        try {
            for (const transaction of transactions) {
                const journalId = transaction.transaction_journal_id;
                if (!journalId) {
                    logger.debug(
                        { description: transaction.description },
                        'Transaction missing journal ID:'
                    );
                    continue;
                }

                if (!aiResults[journalId]) {
                    logger.debug(
                        { description: transaction.description },
                        'No AI results for transaction:'
                    );
                    continue;
                }

                const updateResult = await this.interactiveTransactionUpdater.updateTransaction(
                    transaction,
                    aiResults
                );

                if (updateResult.ok) {
                    if (updateResult.value) {
                        results.push(updateResult.value);
                    }
                } else if (updateResult.error) {
                    errors.push({
                        transaction,
                        error: updateResult.error,
                    });

                    if (updateResult.error.message.includes('SIGINT')) {
                        logger.debug(transaction, 'Transaction update(s) terminated with SIGINT');
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
                `${dryRun ? '[DRYRUN] ' : ''}Transaction update completed`
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
