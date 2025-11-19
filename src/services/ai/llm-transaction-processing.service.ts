import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { LLMAssignmentService } from './llm-assignment.service';
import { logger } from '../../logger';

interface ITransactionProcessor {
    processTransactions(
        transactions: TransactionSplit[],
        categories?: string[],
        budgets?: string[]
    ): Promise<AIResponse>;
}

export interface AIResult {
    category?: string;
    budget?: string;
}

export interface AIResponse {
    [key: string]: AIResult;
}

/**
 * Orchestrates LLM-powered transaction processing for categories and budgets.
 *
 * Simplified design:
 * - Delegates all AI logic to LLMAssignmentService
 * - No batching (handled by ClaudeClient)
 * - No similarity calculation (removed unused complexity)
 * - Single responsibility: coordinate category and budget assignment
 */
export class LLMTransactionProcessingService implements ITransactionProcessor {
    constructor(private readonly llmAssignmentService: LLMAssignmentService) {}

    async processTransactions(
        transactions: TransactionSplit[],
        categories?: string[],
        budgets?: string[]
    ): Promise<AIResponse> {
        if (!transactions.length) {
            return {};
        }

        logger.debug(
            {
                transactionCount: transactions.length,
                categoryCount: categories?.length || 0,
                budgetCount: budgets?.length || 0,
            },
            'Starting transaction processing'
        );

        // Process categories
        const assignedCategories = categories?.length
            ? await this.processCategories(transactions, categories)
            : [];

        // Process budgets
        const assignedBudgets = budgets?.length
            ? await this.processBudgets(transactions, budgets)
            : [];

        // Build response object mapping transaction IDs to assignments
        const result = transactions.reduce((acc, t, index) => {
            acc[t.transaction_journal_id || ''] = {
                ...(assignedCategories[index] && {
                    category: assignedCategories[index],
                }),
                ...(assignedBudgets[index] && {
                    budget: assignedBudgets[index],
                }),
            };
            return acc;
        }, {} as AIResponse);

        logger.debug(
            {
                processedCount: Object.keys(result).length,
                categoryCount: Object.values(result).filter(r => r.category).length,
                budgetCount: Object.values(result).filter(r => r.budget).length,
            },
            'Transaction processing complete'
        );

        return result;
    }

    private async processCategories(
        transactions: TransactionSplit[],
        categories: string[]
    ): Promise<string[]> {
        try {
            logger.debug(
                {
                    transactionCount: transactions.length,
                    categoryCount: categories.length,
                },
                'Processing categories'
            );

            const results = await this.llmAssignmentService.assignCategories(
                transactions,
                categories
            );

            logger.debug(
                {
                    totalProcessed: results.filter(r => r && r !== '(no category)').length,
                    totalTransactions: transactions.length,
                },
                'Category processing complete'
            );

            return results;
        } catch (error) {
            logger.error(
                {
                    error: error instanceof Error ? error.message : String(error),
                    transactionCount: transactions.length,
                    categoryCount: categories.length,
                },
                'Unable to assign categories'
            );
            return new Array(transactions.length).fill('');
        }
    }

    private async processBudgets(
        transactions: TransactionSplit[],
        budgets: string[]
    ): Promise<string[]> {
        try {
            logger.debug(
                {
                    transactionCount: transactions.length,
                    budgetCount: budgets.length,
                },
                'Processing budgets'
            );

            const results = await this.llmAssignmentService.assignBudgets(transactions, budgets);

            logger.debug(
                {
                    totalProcessed: results.filter(r => r && r !== '(no budget)').length,
                    totalTransactions: transactions.length,
                },
                'Budget processing complete'
            );

            return results;
        } catch (error) {
            logger.error(
                {
                    error: error instanceof Error ? error.message : String(error),
                    transactionCount: transactions.length,
                    budgetCount: budgets.length,
                },
                'Unable to assign budgets'
            );
            return new Array(transactions.length).fill('');
        }
    }
}
