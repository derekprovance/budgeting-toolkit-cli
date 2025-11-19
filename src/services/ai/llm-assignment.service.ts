import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ClaudeClient } from '../../api/claude.client';
import { logger } from '../../logger';
import {
    AssignmentType,
    getFunctionSchema,
    getSystemPrompt,
    getUserPrompt,
    parseAssignmentResponse,
} from './utils/prompt-templates';
import { mapTransactionForLLM } from './utils/transaction-mapper';

/**
 * Unified service for LLM-powered transaction assignments.
 * Handles both category and budget assignments using the same underlying logic.
 *
 * Key design principles:
 * - Single responsibility: Only handles LLM assignment logic
 * - No batching: Batching is delegated to ClaudeClient
 * - No retries: Retry logic is handled by ClaudeClient
 * - DRY: Shared logic for both categories and budgets
 */
export class LLMAssignmentService {
    constructor(private readonly claudeClient: ClaudeClient) {}

    /**
     * Assigns categories or budgets to transactions using Claude AI.
     *
     * @param type - The assignment type: 'category' or 'budget'
     * @param transactions - Array of transactions to process
     * @param validOptions - Array of valid categories or budgets
     * @returns Array of assigned values in the same order as transactions
     *
     * Note: This method delegates batching to ClaudeClient. All transactions
     * are processed but ClaudeClient handles the optimal batch size and
     * concurrent request management.
     */
    async assign(
        type: AssignmentType,
        transactions: TransactionSplit[],
        validOptions: string[]
    ): Promise<string[]> {
        // Validation
        if (!transactions || transactions.length === 0) {
            logger.warn(`No transactions provided for ${type} assignment`);
            return [];
        }

        if (!validOptions || validOptions.length === 0) {
            throw new Error(`No valid ${type} options provided`);
        }

        logger.info(
            {
                type,
                transactionCount: transactions.length,
                optionCount: validOptions.length,
            },
            `Starting ${type} assignment`
        );

        try {
            // Map transactions to LLM format
            const transactionData = transactions.map(mapTransactionForLLM);

            // Generate prompts
            const systemPrompt = getSystemPrompt(type);
            const userPrompt = getUserPrompt(type, transactionData, validOptions);
            const functionSchema = getFunctionSchema(type, validOptions);

            // Call Claude (batching handled internally by ClaudeClient)
            const result = await this.claudeClient.chat(
                [
                    { role: 'user', content: userPrompt },
                ],
                {
                    systemPrompt,
                    functions: [functionSchema],
                }
            );

            // Parse and validate response
            const assignments = parseAssignmentResponse(
                type,
                result,
                transactions.length,
                validOptions
            );

            logger.info(
                {
                    type,
                    assignedCount: assignments.length,
                    successRate: this.calculateSuccessRate(assignments, type),
                },
                `${type} assignment completed`
            );

            return assignments;
        } catch (error) {
            logger.error(
                {
                    error: error instanceof Error ? error.message : String(error),
                    type,
                    transactionCount: transactions.length,
                },
                `${type} assignment failed`
            );

            // Return default values for all transactions
            const defaultValue = type === 'category' ? '(no category)' : '(no budget)';
            return new Array(transactions.length).fill(defaultValue);
        }
    }

    /**
     * Assigns categories to transactions.
     * Convenience method that wraps assign() with type='category'.
     */
    async assignCategories(
        transactions: TransactionSplit[],
        validCategories: string[]
    ): Promise<string[]> {
        return this.assign('category', transactions, validCategories);
    }

    /**
     * Assigns budgets to transactions.
     * Convenience method that wraps assign() with type='budget'.
     */
    async assignBudgets(
        transactions: TransactionSplit[],
        validBudgets: string[]
    ): Promise<string[]> {
        return this.assign('budget', transactions, validBudgets);
    }

    /**
     * Calculates the success rate of assignments (non-default values)
     */
    private calculateSuccessRate(assignments: string[], type: AssignmentType): string {
        const defaultValue = type === 'category' ? '(no category)' : '(no budget)';
        const successCount = assignments.filter(a => a !== defaultValue).length;
        const rate = (successCount / assignments.length) * 100;
        return `${rate.toFixed(1)}%`;
    }
}
