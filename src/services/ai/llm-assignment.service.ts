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

interface ChunkResult {
    values: string[];
    /** True when the chunk failed and was filled with the no-match sentinel */
    degraded: boolean;
}

export interface LLMBatchOptions {
    /** Transactions per request — keeps responses well under maxTokens */
    batchSize: number;
    /** Concurrent in-flight requests */
    maxConcurrent: number;
}

/**
 * A recoverable failure degrades only its own chunk to the no-match sentinel;
 * critical errors (see isCriticalError) abort the whole run.
 */
export class LLMAssignmentService {
    constructor(
        private readonly claudeClient: ClaudeClient,
        private readonly batchOptions: LLMBatchOptions,
        private readonly logger: ILogger = defaultLogger
    ) {}

    /**
     * @param validOptions - the no-match sentinel is added internally; callers
     *   should not append it
     * @returns One value per transaction, in order; `undefined` where no
     *   option fits or the chunk degraded
     * @throws on a critical error (see isCriticalError) or when `validOptions` is empty
     */
    async assign(
        type: AssignmentType,
        transactions: TransactionSplit[],
        validOptions: string[]
    ): Promise<(string | undefined)[]> {
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

        const transactionData = transactions.map(mapTransactionForLLM);
        const chunks = LLMAssignmentService.chunk(transactionData, this.batchOptions.batchSize);

        // Identical across chunks, for a stable prompt prefix
        const systemPrompt = getSystemPrompt(type);
        const functionSchema = getFunctionSchema(type, validOptions);

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

        // A degraded chunk's sentinels look like a genuine "no match", so the
        // count must be carried out rather than inferred
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
     * Failures the next chunk cannot survive, so degrading would quietly
     * sentinel-fill the rest of the run and still report success:
     *
     * - auth / permission: will not heal on retry
     * - bad request: a config bug that silent degradation would hide
     * - circuit open: every remaining chunk would be rejected anyway
     * - truncated: the response outgrew `llm.maxTokens`, as every later chunk will
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
