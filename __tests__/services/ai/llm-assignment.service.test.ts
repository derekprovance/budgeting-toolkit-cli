import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import Anthropic from '@anthropic-ai/sdk';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { LLMAssignmentService } from '../../../src/services/ai/llm-assignment.service.js';
import { ILogger } from '../../../src/types/interface/logger.interface.js';
import {
    ClaudeClient,
    CircuitOpenError,
    ClaudeResponseError,
    ToolCall,
} from '../../../src/api/claude.client.js';
import { createMockTransaction } from '../../shared/test-data.js';

type CallToolFn = ClaudeClient['callTool'];

const categoriesResponse = (...categories: string[]) => JSON.stringify({ categories });
const budgetsResponse = (...budgets: string[]) => JSON.stringify({ budgets });

const sdkError = (errorClass: { prototype: object }, message: string): Error =>
    Object.assign(Object.create(errorClass.prototype) as Error, { message });

const makeTransactions = (count: number) =>
    Array.from({ length: count }, (_, i) =>
        createMockTransaction({
            transaction_journal_id: String(i),
            description: `Transaction ${i}`,
        })
    );

describe('LLMAssignmentService', () => {
    let service: LLMAssignmentService;
    let callTool: jest.Mock<CallToolFn>;
    let mockLogger: jest.Mocked<ILogger>;
    let mockTransactions: TransactionSplit[];
    const validCategories = ['Groceries', 'Healthcare', 'Shopping'];
    const validBudgets = ['Food', 'Medical', 'Shopping'];

    beforeEach(() => {
        mockLogger = {
            info: jest.fn<(obj: unknown, msg: string) => void>(),
            warn: jest.fn<(obj: unknown, msg: string) => void>(),
            error: jest.fn<(obj: unknown, msg: string) => void>(),
            debug: jest.fn<(obj: unknown, msg: string) => void>(),
            trace: jest.fn<(obj: unknown, msg: string) => void>(),
        } as jest.Mocked<ILogger>;

        callTool = jest.fn<CallToolFn>();
        service = new LLMAssignmentService(
            { callTool } as unknown as ClaudeClient,
            { batchSize: 10, maxConcurrent: 3 },
            mockLogger
        );

        mockTransactions = [
            createMockTransaction({
                transaction_journal_id: '1',
                description: 'Walmart Supercenter',
                amount: '150.00',
                source_name: 'Checking Account',
                destination_name: 'Walmart',
            }),
            createMockTransaction({
                transaction_journal_id: '2',
                description: 'Walmart Pharmacy',
                amount: '25.00',
                source_name: 'Checking Account',
                destination_name: 'Walmart Pharmacy',
            }),
            createMockTransaction({
                transaction_journal_id: '3',
                description: 'Amazon Fresh',
                amount: '75.00',
                source_name: 'Checking Account',
                destination_name: 'Amazon',
            }),
        ];
    });

    const sentCall = (index = 0): ToolCall => callTool.mock.calls[index][0];

    describe('assign', () => {
        describe('validation', () => {
            it('should return empty array and log warning when no transactions provided', async () => {
                const result = await service.assign('category', [], validCategories);

                expect(result).toEqual([]);
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    'No transactions provided for category assignment'
                );
                expect(callTool).not.toHaveBeenCalled();
            });

            it('should throw error when no valid options provided', async () => {
                await expect(service.assign('category', mockTransactions, [])).rejects.toThrow(
                    'No valid category options provided'
                );
            });

            it('should throw error for budget type when no valid budgets', async () => {
                await expect(service.assign('budget', mockTransactions, [])).rejects.toThrow(
                    'No valid budget options provided'
                );
            });
        });

        describe('successful assignment', () => {
            beforeEach(() => {
                callTool.mockResolvedValue(
                    categoriesResponse('Groceries', 'Healthcare', 'Groceries')
                );
            });

            it('should successfully assign categories to transactions', async () => {
                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['Groceries', 'Healthcare', 'Groceries']);
            });

            it('should send every transaction and option in the prompt', async () => {
                await service.assign('category', mockTransactions, validCategories);

                const { userPrompt } = sentCall();
                for (const tx of mockTransactions) {
                    expect(userPrompt).toContain(tx.description);
                }
                for (const option of validCategories) {
                    expect(userPrompt).toContain(`- ${option}`);
                }
            });

            it('should force the assignment tool for the requested type', async () => {
                await service.assign('category', mockTransactions, validCategories);

                expect(sentCall().tool.name).toBe('assign_categories');
                expect(sentCall().systemPrompt).toContain('category');
            });

            it('should work with budget assignment type', async () => {
                callTool.mockResolvedValue(budgetsResponse('Food', 'Medical', 'Food'));

                const result = await service.assign('budget', mockTransactions, validBudgets);

                expect(result).toEqual(['Food', 'Medical', 'Food']);
                expect(sentCall().tool.name).toBe('assign_budgets');
            });

            it('should return undefined where no option fits', async () => {
                callTool.mockResolvedValue(
                    categoriesResponse('Groceries', '(no category)', 'Groceries')
                );

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['Groceries', undefined, 'Groceries']);
            });

            it('should calculate success rate correctly for partial assignments', async () => {
                callTool.mockResolvedValue(
                    categoriesResponse('Groceries', '(no category)', 'Groceries')
                );

                await service.assign('category', mockTransactions, validCategories);

                expect(mockLogger.debug).toHaveBeenCalledWith(
                    { type: 'category', assignedCount: 3, successRate: '66.7%' },
                    'category assignment completed'
                );
            });
        });

        describe('error handling', () => {
            it('should return default categories on Claude API error', async () => {
                callTool.mockRejectedValue(new Error('API Error'));

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual([undefined, undefined, undefined]);
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    expect.objectContaining({ error: 'API Error', type: 'category' }),
                    'category assignment chunk failed, using defaults for this chunk'
                );
            });

            it('should return default budgets on Claude API error', async () => {
                callTool.mockRejectedValue(new Error('API Error'));

                const result = await service.assign('budget', mockTransactions, validBudgets);

                expect(result).toEqual([undefined, undefined, undefined]);
            });

            it('should abort the run when the circuit breaker is open', async () => {
                // Every remaining chunk would be rejected without an API call,
                // so degrading them to the sentinel would sentinel-fill the
                // rest of the run and still report success.
                callTool.mockRejectedValue(new CircuitOpenError('Circuit is open'));

                await expect(
                    service.assign('category', mockTransactions, validCategories)
                ).rejects.toThrow(CircuitOpenError);
            });

            it('should abort the run when a response is truncated at max_tokens', async () => {
                // Truncation means the response outgrew llm.maxTokens — a
                // configuration problem every later chunk will hit too.
                callTool.mockRejectedValue(new ClaudeResponseError('truncated', 'Truncated'));

                await expect(
                    service.assign('category', mockTransactions, validCategories)
                ).rejects.toThrow(ClaudeResponseError);
            });

            it('should still degrade a chunk on a recoverable response error', async () => {
                callTool.mockRejectedValue(
                    new ClaudeResponseError('missing_tool_use', 'No tool call')
                );

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual([undefined, undefined, undefined]);
            });

            it('should report how many transactions went unassigned after degrading', async () => {
                callTool.mockRejectedValue(new Error('API Error'));

                await service.assign('category', mockTransactions, validCategories);

                expect(mockLogger.warn).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'category',
                        degradedTransactionCount: 3,
                        totalTransactions: 3,
                    }),
                    expect.stringContaining('were not processed')
                );
            });

            it('should not report degradation when every chunk succeeds', async () => {
                callTool.mockResolvedValue(
                    categoriesResponse('Groceries', 'Healthcare', 'Groceries')
                );

                await service.assign('category', mockTransactions, validCategories);

                expect(mockLogger.warn).not.toHaveBeenCalledWith(
                    expect.objectContaining({ degradedTransactionCount: expect.anything() }),
                    expect.anything()
                );
            });

            it('should degrade a chunk whose response is not JSON', async () => {
                callTool.mockResolvedValue('Invalid JSON');

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual([undefined, undefined, undefined]);
            });

            it('should degrade a chunk whose response has the wrong count', async () => {
                callTool.mockResolvedValue(categoriesResponse('Groceries', 'Healthcare'));

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual([undefined, undefined, undefined]);
            });

            it('should handle non-Error objects thrown', async () => {
                callTool.mockRejectedValue('String error');

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual([undefined, undefined, undefined]);
            });

            it('should throw on authentication error (critical error)', async () => {
                callTool.mockRejectedValue(
                    sdkError(Anthropic.AuthenticationError, 'Invalid API key provided')
                );

                await expect(
                    service.assign('category', mockTransactions, validCategories)
                ).rejects.toThrow('Invalid API key provided');

                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.objectContaining({
                        error: 'Invalid API key provided',
                        type: 'category',
                    }),
                    'Critical error in category assignment'
                );
            });

            it('should throw on permission error (critical error)', async () => {
                callTool.mockRejectedValue(sdkError(Anthropic.PermissionDeniedError, 'forbidden'));

                await expect(
                    service.assign('category', mockTransactions, validCategories)
                ).rejects.toThrow('forbidden');
            });

            it('should throw on bad request (critical error)', async () => {
                callTool.mockRejectedValue(sdkError(Anthropic.BadRequestError, 'invalid model'));

                await expect(
                    service.assign('budget', mockTransactions, validBudgets)
                ).rejects.toThrow('invalid model');
            });

            it('should degrade (not throw) on plain errors mentioning auth words', async () => {
                // String matching is gone: only typed SDK errors are critical
                callTool.mockRejectedValue(new Error('authentication failed'));

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual([undefined, undefined, undefined]);
            });
        });
    });

    describe('batching', () => {
        it('should chunk 25 transactions into 3 requests of 10/10/5, preserving order', async () => {
            const transactions = makeTransactions(25);
            const chunkOptions = ['chunk-0', 'chunk-1', 'chunk-2'];

            // Each chunk answers with its own option so ordering is provable
            let call = 0;
            callTool.mockImplementation(async ({ userPrompt }) => {
                const count = (userPrompt.match(/^\d+\. /gm) ?? []).length;
                return categoriesResponse(...Array<string>(count).fill(`chunk-${call++}`));
            });

            const result = await service.assign('category', transactions, chunkOptions);

            expect(callTool).toHaveBeenCalledTimes(3);
            expect(result.slice(0, 10)).toEqual(Array(10).fill('chunk-0'));
            expect(result.slice(10, 20)).toEqual(Array(10).fill('chunk-1'));
            expect(result.slice(20)).toEqual(Array(5).fill('chunk-2'));
        });

        it('should degrade only the failing chunk to the sentinel', async () => {
            const transactions = makeTransactions(25);

            let call = 0;
            callTool.mockImplementation(async ({ userPrompt }) => {
                if (call++ === 1) {
                    throw new Error('connection reset');
                }
                const count = (userPrompt.match(/^\d+\. /gm) ?? []).length;
                return categoriesResponse(...Array<string>(count).fill('Groceries'));
            });

            const result = await service.assign('category', transactions, validCategories);

            expect(result.slice(0, 10)).toEqual(Array(10).fill('Groceries'));
            expect(result.slice(10, 20)).toEqual(Array(10).fill(undefined));
            expect(result.slice(20)).toEqual(Array(5).fill('Groceries'));
        });

        it('should abort the whole run when any chunk hits a critical error', async () => {
            callTool.mockRejectedValue(sdkError(Anthropic.AuthenticationError, 'invalid key'));

            await expect(
                service.assign('category', makeTransactions(25), validCategories)
            ).rejects.toThrow('invalid key');
        });
    });
});
