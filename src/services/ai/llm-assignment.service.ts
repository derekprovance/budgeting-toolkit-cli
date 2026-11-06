import Anthropic from '@anthropic-ai/sdk';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ClaudeClient, CircuitOpenError, ClaudeResponseError } from '../../api/claude.client.js';
import { logger as defaultLogger } from '../../logger.js';
import {
    AssignmentType,
    getFunctionSchema,
    getNoMatchValue,
    isNoMatch,
    getSystemPrompt,
    getUserPrompt,
    parseAssignmentResponse,
} from './utils/prompt-templates.js';
import { mapTransactionForLLM, LLMTransactionData } from './utils/transaction-mapper.js';
import { ILogger } from '../../types/interface/logger.interface.js';
import { errorMessage } from '../../utils/error-detection.utils.js';

/** One chunk's assignments, plus whether they are real or a degraded fallback */
interface ChunkResult {
    values: string[];
    /** True when the chunk failed and was filled with the no-match sentinel */
    degraded: boolean;
}

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
 * Unified service for LLM-powered transaction assignments.
 * Handles both category and budget assignments using the same underlying logic.
 *
 * Batching: transactions are chunked by batchSize and processed by a bounded
 * worker pool. A recoverable failure degrades only its own chunk to the
 * no-match sentinel; critical errors (auth, bad request) abort the whole run.
 */
export class LLMAssignmentService {
    constructor(
        private readonly claudeClient: ClaudeClient,
        private readonly batchOptions: LLMBatchOptions,
        private readonly logger: ILogger = defaultLogger
    ) {}

    /**
     * Assigns categories or budgets to transactions using Claude AI.
     *
     * @param type - The assignment type: 'category' or 'budget'
     * @param transactions - Array of transactions to process
     * @param validOptions - Array of valid categories or budgets (the no-match
     * sentinel is handled internally — callers should not append it)
     * @returns One value per transaction, in order; `undefined` where no
     *   option fits or the chunk degraded
     * @throws on a critical error (see isCriticalError) or when `validOptions` is empty
     */
    async assign(
        type: AssignmentType,
        transactions: TransactionSplit[],
        validOptions: string[]
    ): Promise<(string | undefined)[]> {
        // Validation
        if (!transactions || transactions.length === 0) {
            this.logger.warn(`No transactions provided for ${type} assignment`);
            return [];
        }

        if (!validOptions || validOptions.length === 0) {
            throw new Error(`No valid ${type} options provided`);
        }

        this.logger.debug(
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
        const transactionData = transactions.map(mapTransactionForLLM);
        const chunks = LLMAssignmentService.chunk(transactionData, this.batchOptions.batchSize);

        // Built once — identical across chunks (stable prompt prefix)
        const systemPrompt = getSystemPrompt(type);
        const functionSchema = getFunctionSchema(type, validOptions);

        // Bounded worker pool with order-preserving results
        const results: ChunkResult[] = new Array(chunks.length);
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

        const assignments = results.flatMap(result => result.values);

        // A degraded chunk yields sentinels indistinguishable from a genuine
        // "no match", so the count has to be carried out rather than inferred.
        // Without this the run reports success while some transactions were
        // never actually looked at.
        const degradedTransactionCount = results
            .filter(result => result.degraded)
            .reduce((sum, result) => sum + result.values.length, 0);

        if (degradedTransactionCount > 0) {
            this.logger.warn(
                {
                    type,
                    degradedTransactionCount,
                    totalTransactions: transactions.length,
                    degradedChunks: results.filter(r => r.degraded).length,
                    totalChunks: chunks.length,
                },
                `${type} assignment degraded - ${degradedTransactionCount} of ${transactions.length} transactions were not processed and will be left unassigned`
            );
        }

        // Log each transaction's AI assignment for debugging
        assignments.forEach((assignment, index) => {
            this.logger.trace(
                {
                    index,
                    transactionDescription: transactionData[index]?.description,
                    aiResponse: assignment,
                    isPlaceholder: assignment === getNoMatchValue(type),
                },
                `AI ${type} assignment result`
            );
        });

        this.logger.debug(
            {
                type,
                assignedCount: assignments.length,
                successRate: this.calculateSuccessRate(assignments, type),
            },
            `${type} assignment completed`
        );

        return assignments.map(assignment =>
            isNoMatch(type, assignment) ? undefined : assignment
        );
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
    ): Promise<ChunkResult> {
        try {
            const userPrompt = getUserPrompt(type, chunk, validOptions);

            const result = await this.claudeClient.callTool({
                systemPrompt,
                userPrompt,
                tool: functionSchema,
            });

            return {
                values: parseAssignmentResponse(type, result, chunk.length),
                degraded: false,
            };
        } catch (error) {
            if (this.isCriticalError(error)) {
                this.logger.error(
                    {
                        error: errorMessage(error),
                        type,
                        chunkIndex,
                        chunkSize: chunk.length,
                    },
                    `Critical error in ${type} assignment`
                );
                throw error;
            }

            this.logger.warn(
                {
                    error: errorMessage(error),
                    type,
                    chunkIndex,
                    chunkSize: chunk.length,
                },
                `${type} assignment chunk failed, using defaults for this chunk`
            );

            return {
                values: new Array<string>(chunk.length).fill(getNoMatchValue(type)),
                degraded: true,
            };
        }
    }

    /**
     * Critical errors abort the whole run rather than degrading a chunk to the
     * sentinel. Degrading is only ever the right call for a failure the *next*
     * chunk might survive; for everything below, carrying on would quietly
     * sentinel-fill the rest of the run and still report success.
     *
     * - auth / permission: will not heal on retry
     * - bad request: a config bug that silent degradation would hide
     * - circuit open: the breaker has already given up, so every remaining
     *   chunk would be rejected without even reaching the API
     * - truncated: the response outgrew `llm.maxTokens`, which is a
     *   configuration problem that every subsequent chunk will hit too
     */
    private isCriticalError(error: unknown): boolean {
        if (error instanceof ClaudeResponseError) {
            return error.reason === 'truncated';
        }

        return (
            error instanceof Anthropic.AuthenticationError ||
            error instanceof Anthropic.PermissionDeniedError ||
            error instanceof Anthropic.BadRequestError ||
            error instanceof CircuitOpenError
        );
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
