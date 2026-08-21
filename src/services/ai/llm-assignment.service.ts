import Anthropic from '@anthropic-ai/sdk';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ClaudeClient } from '../../api/claude.client.js';
import { logger as defaultLogger } from '../../logger.js';
import {
    AssignmentType,
    getFunctionSchema,
    getNoMatchValue,
    getSystemPrompt,
    getUserPrompt,
    parseAssignmentResponse,
} from './utils/prompt-templates.js';
import { mapTransactionForLLM, LLMTransactionData } from './utils/transaction-mapper.js';
import { ILogger } from '../../types/interface/logger.interface.js';

/**
 * Batching options for LLM assignment requests
 */
export interface LLMBatchOptions {
    /** Transactions per request — keeps responses well under maxTokens */
    batchSize: number;
    /** Concurrent in-flight requests */
    maxConcurrent: number;
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
    getFunctionSchema: (type: AssignmentType, validOptions: string[]) => Anthropic.Tool;
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
 * Batching: transactions are chunked by batchSize and processed by a bounded
 * worker pool. A recoverable failure degrades only its own chunk to the
 * no-match sentinel; critical errors (auth, bad request) abort the whole run.
 */
export class LLMAssignmentService {
    private readonly deps: LLMAssignmentDependencies;
    private readonly batchOptions: LLMBatchOptions;

    constructor(
        private readonly claudeClient: ClaudeClient,
        batchOptions?: Partial<LLMBatchOptions>,
        deps?: Partial<LLMAssignmentDependencies>
    ) {
        this.batchOptions = {
            batchSize: batchOptions?.batchSize ?? 10,
            maxConcurrent: batchOptions?.maxConcurrent ?? 3,
        };
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
     * @param validOptions - Array of valid categories or budgets (the no-match
     * sentinel is handled internally — callers should not append it)
     * @returns Array of assigned values in the same order as transactions
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
                batchSize: this.batchOptions.batchSize,
                maxConcurrent: this.batchOptions.maxConcurrent,
            },
            `Starting ${type} assignment`
        );

        // Map transactions to LLM format and chunk them
        const transactionData = transactions.map(this.deps.mapTransactionForLLM);
        const chunks = LLMAssignmentService.chunk(transactionData, this.batchOptions.batchSize);

        // Built once — identical across chunks (stable prompt prefix)
        const systemPrompt = this.deps.getSystemPrompt(type);
        const functionSchema = this.deps.getFunctionSchema(type, validOptions);

        // Bounded worker pool with order-preserving results
        const results: string[][] = new Array(chunks.length);
        let nextChunk = 0;
        const workerCount = Math.min(this.batchOptions.maxConcurrent, chunks.length);

        const worker = async (): Promise<void> => {
            for (;;) {
                const chunkIndex = nextChunk++;
                if (chunkIndex >= chunks.length) {
                    return;
                }
                results[chunkIndex] = await this.processChunk(
                    type,
                    chunks[chunkIndex],
                    validOptions,
                    systemPrompt,
                    functionSchema,
                    chunkIndex
                );
            }
        };

        await Promise.all(Array.from({ length: workerCount }, worker));

        const assignments = results.flat();

        // Log each transaction's AI assignment for debugging
        assignments.forEach((assignment, index) => {
            this.deps.logger.trace(
                {
                    index,
                    transactionDescription: transactionData[index]?.description,
                    aiResponse: assignment,
                    isPlaceholder: assignment === getNoMatchValue(type),
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
    }

    /**
     * Processes one chunk. Recoverable failures fill only this chunk with the
     * sentinel; critical errors propagate and abort the run.
     */
    private async processChunk(
        type: AssignmentType,
        chunk: LLMTransactionData[],
        validOptions: string[],
        systemPrompt: string,
        functionSchema: Anthropic.Tool,
        chunkIndex: number
    ): Promise<string[]> {
        try {
            const userPrompt = this.deps.getUserPrompt(type, chunk, validOptions);

            const result = await this.claudeClient.chat([{ role: 'user', content: userPrompt }], {
                systemPrompt,
                tools: [functionSchema],
                toolChoice: { type: 'tool', name: functionSchema.name },
            });

            return this.deps.parseAssignmentResponse(type, result, chunk.length, validOptions);
        } catch (error) {
            if (this.isCriticalError(error)) {
                this.deps.logger.error(
                    {
                        error: error instanceof Error ? error.message : String(error),
                        type,
                        chunkIndex,
                        chunkSize: chunk.length,
                    },
                    `Critical error in ${type} assignment`
                );
                throw error;
            }

            this.deps.logger.warn(
                {
                    error: error instanceof Error ? error.message : String(error),
                    type,
                    chunkIndex,
                    chunkSize: chunk.length,
                },
                `${type} assignment chunk failed, using defaults for this chunk`
            );

            return new Array<string>(chunk.length).fill(getNoMatchValue(type));
        }
    }

    /**
     * Critical errors abort the whole run: authentication and permission
     * failures won't heal on retry, and a bad request signals a config bug
     * that silent degradation would hide.
     */
    private isCriticalError(error: unknown): boolean {
        return (
            error instanceof Anthropic.AuthenticationError ||
            error instanceof Anthropic.PermissionDeniedError ||
            error instanceof Anthropic.BadRequestError
        );
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

    private static chunk<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Calculates the success rate of assignments (non-default values)
     */
    private calculateSuccessRate(assignments: string[], type: AssignmentType): string {
        if (assignments.length === 0) {
            return '0.0%';
        }

        const defaultValue = getNoMatchValue(type);
        const successCount = assignments.filter(a => a !== defaultValue).length;
        const rate = (successCount / assignments.length) * 100;
        return `${rate.toFixed(1)}%`;
    }
}
