import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ClaudeClient } from '../../api/claude.client.js';
import { logger as defaultLogger } from '../../logger.js';
import {
    AssignmentType,
    getFunctionSchema,
    getSystemPrompt,
    getUserPrompt,
    parseAssignmentResponse,
} from './utils/prompt-templates.js';
import { mapTransactionForLLM, LLMTransactionData } from './utils/transaction-mapper.js';
import { ILogger } from '../../types/interface/logger.interface.js';

/**
 * Function schema for Claude's function calling API
 */
export interface FunctionSchema {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<
            string,
            {
                type: string;
                description?: string;
                enum?: string[];
            }
        >;
        required: string[];
    };
}

/**
 * Dependencies for LLMAssignmentService (for testing)
 */
export interface LLMAssignmentDependencies {
    mapTransactionForLLM: (tx: TransactionSplit) => LLMTransactionData;
    getSystemPrompt: (type: AssignmentType) => string;
    getUserPrompt: (
        type: AssignmentType,
        transactions: LLMTransactionData[],
        validOptions: string[]
    ) => string;
    getFunctionSchema: (type: AssignmentType, validOptions: string[]) => FunctionSchema;
    parseAssignmentResponse: (
        type: AssignmentType,
        responseText: string,
        expectedCount: number,
        validOptions: string[]
    ) => string[];
    logger: ILogger;
}

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
    private readonly deps: LLMAssignmentDependencies;

    constructor(
        private readonly claudeClient: ClaudeClient,
        deps?: Partial<LLMAssignmentDependencies>
    ) {
        this.deps = {
            mapTransactionForLLM,
            getSystemPrompt,
            getUserPrompt,
            getFunctionSchema,
            parseAssignmentResponse,
            logger: defaultLogger,
            ...deps,
        };
    }

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
            this.deps.logger.warn(`No transactions provided for ${type} assignment`);
            return [];
        }

        if (!validOptions || validOptions.length === 0) {
            throw new Error(`No valid ${type} options provided`);
        }

        this.deps.logger.debug(
            {
                type,
                transactionCount: transactions.length,
                optionCount: validOptions.length,
            },
            `Starting ${type} assignment`
        );

        try {
            // Map transactions to LLM format
            const transactionData = transactions.map(this.deps.mapTransactionForLLM);

            // Generate prompts
            const systemPrompt = this.deps.getSystemPrompt(type);
            const userPrompt = this.deps.getUserPrompt(type, transactionData, validOptions);
            const functionSchema = this.deps.getFunctionSchema(type, validOptions);

            // Call Claude
            const result = await this.claudeClient.chat([{ role: 'user', content: userPrompt }], {
                systemPrompt,
                functions: [functionSchema],
                function_call: { name: functionSchema.name },
            });

            // Parse and validate response
            const assignments = this.deps.parseAssignmentResponse(
                type,
                result,
                transactions.length,
                validOptions
            );

            // Log each transaction's AI assignment for debugging
            assignments.forEach((assignment, index) => {
                this.deps.logger.trace(
                    {
                        index,
                        transactionDescription: transactionData[index]?.description,
                        aiResponse: assignment,
                        isPlaceholder: assignment === `(no ${type})`,
                    },
                    `AI ${type} assignment result`
                );
            });

            this.deps.logger.debug(
                {
                    type,
                    assignedCount: assignments.length,
                    successRate: this.calculateSuccessRate(assignments, type),
                },
                `${type} assignment completed`
            );

            return assignments;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Critical errors that should propagate (authentication, configuration issues)
            if (
                errorMessage.includes('API key') ||
                errorMessage.includes('authentication') ||
                errorMessage.includes('unauthorized') ||
                errorMessage.includes('forbidden')
            ) {
                this.deps.logger.error(
                    {
                        error: errorMessage,
                        type,
                        transactionCount: transactions.length,
                    },
                    `Critical authentication error in ${type} assignment`
                );
                throw error;
            }

            // Recoverable errors - log and return defaults
            this.deps.logger.warn(
                {
                    error: errorMessage,
                    type,
                    transactionCount: transactions.length,
                },
                `${type} assignment failed, returning defaults`
            );

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
        if (assignments.length === 0) {
            return '0.0%';
        }

        const defaultValue = type === 'category' ? '(no category)' : '(no budget)';
        const successCount = assignments.filter(a => a !== defaultValue).length;
        const rate = (successCount / assignments.length) * 100;
        return `${rate.toFixed(1)}%`;
    }
}
