import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import '../../setup/mock-logger';
import { mockLogger } from '../../setup/mock-logger';
import { LLMAssignmentService } from '../../../src/services/ai/llm-assignment.service';
import { ClaudeClient } from '../../../src/api/claude.client';
import { createMockTransaction } from '../../shared/test-data';

// Mock dependencies
jest.mock('../../../src/api/claude.client');
jest.mock('../../../src/services/ai/utils/prompt-templates');
jest.mock('../../../src/services/ai/utils/transaction-mapper');

// Import mocked modules for type-safe mocking
import * as promptTemplates from '../../../src/services/ai/utils/prompt-templates';
import * as transactionMapper from '../../../src/services/ai/utils/transaction-mapper';

describe('LLMAssignmentService', () => {
    let service: LLMAssignmentService;
    let mockClaudeClient: jest.Mocked<ClaudeClient>;
    let mockTransactions: TransactionSplit[];
    let validCategories: string[];
    let validBudgets: string[];

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        mockLogger.info.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.error.mockClear();

        // Create mock Claude client
        mockClaudeClient = {
            chat: jest.fn(),
        } as unknown as jest.Mocked<ClaudeClient>;

        // Create service
        service = new LLMAssignmentService(mockClaudeClient);

        // Setup test data
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

        validCategories = ['Groceries', 'Healthcare', 'Shopping', '(no category)'];
        validBudgets = ['Food', 'Medical', 'Shopping', '(no budget)'];

        // Setup default mocks for utility functions
        (transactionMapper.mapTransactionForLLM as jest.Mock).mockImplementation(tx => ({
            description: tx.description,
            amount: tx.amount,
            date: tx.date,
            source_account: tx.source_name,
            destination_account: tx.destination_name,
            type: tx.type,
            notes: tx.notes,
        }));

        (promptTemplates.getSystemPrompt as jest.Mock).mockReturnValue('System prompt');
        (promptTemplates.getUserPrompt as jest.Mock).mockReturnValue('User prompt');
        (promptTemplates.getFunctionSchema as jest.Mock).mockReturnValue({
            name: 'assign_categories',
            description: 'Assign categories',
            parameters: {},
        });
    });

    describe('assign', () => {
        describe('validation', () => {
            it('should return empty array and log warning when no transactions provided', async () => {
                const result = await service.assign('category', [], validCategories);

                expect(result).toEqual([]);
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    'No transactions provided for category assignment'
                );
                expect(mockClaudeClient.chat).not.toHaveBeenCalled();
            });

            it('should return empty array and log warning when transactions is null', async () => {
                const result = await service.assign('category', null as any, validCategories);

                expect(result).toEqual([]);
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    'No transactions provided for category assignment'
                );
            });

            it('should throw error when no valid options provided', async () => {
                await expect(service.assign('category', mockTransactions, [])).rejects.toThrow(
                    'No valid category options provided'
                );
            });

            it('should throw error when valid options is null', async () => {
                await expect(
                    service.assign('category', mockTransactions, null as any)
                ).rejects.toThrow('No valid category options provided');
            });

            it('should throw error for budget type when no valid budgets', async () => {
                await expect(service.assign('budget', mockTransactions, [])).rejects.toThrow(
                    'No valid budget options provided'
                );
            });
        });

        describe('successful assignment', () => {
            beforeEach(() => {
                // Mock successful Claude response
                mockClaudeClient.chat.mockResolvedValue(
                    JSON.stringify({
                        categories: ['Groceries', 'Healthcare', 'Groceries'],
                    })
                );

                // Mock successful parsing
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    'Groceries',
                    'Healthcare',
                    'Groceries',
                ]);
            });

            it('should successfully assign categories to transactions', async () => {
                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['Groceries', 'Healthcare', 'Groceries']);
                expect(mockLogger.info).toHaveBeenCalledWith(
                    {
                        type: 'category',
                        transactionCount: 3,
                        optionCount: 4,
                    },
                    'Starting category assignment'
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    {
                        type: 'category',
                        assignedCount: 3,
                        successRate: '100.0%',
                    },
                    'category assignment completed'
                );
            });

            it('should map transactions using transaction mapper', async () => {
                await service.assign('category', mockTransactions, validCategories);

                expect(transactionMapper.mapTransactionForLLM).toHaveBeenCalledTimes(3);
                // Verify each transaction was mapped
                mockTransactions.forEach((tx, index) => {
                    expect(transactionMapper.mapTransactionForLLM).toHaveBeenNthCalledWith(
                        index + 1,
                        tx,
                        index,
                        mockTransactions
                    );
                });
            });

            it('should call Claude client with correct parameters', async () => {
                await service.assign('category', mockTransactions, validCategories);

                expect(mockClaudeClient.chat).toHaveBeenCalledWith(
                    [{ role: 'user', content: 'User prompt' }],
                    {
                        systemPrompt: 'System prompt',
                        functions: [
                            {
                                name: 'assign_categories',
                                description: 'Assign categories',
                                parameters: {},
                            },
                        ],
                    }
                );
            });

            it('should generate prompts with correct parameters', async () => {
                await service.assign('category', mockTransactions, validCategories);

                expect(promptTemplates.getSystemPrompt).toHaveBeenCalledWith('category');
                expect(promptTemplates.getUserPrompt).toHaveBeenCalledWith(
                    'category',
                    expect.any(Array),
                    validCategories
                );
                expect(promptTemplates.getFunctionSchema).toHaveBeenCalledWith(
                    'category',
                    validCategories
                );
            });

            it('should parse response with correct parameters', async () => {
                const claudeResponse = JSON.stringify({
                    categories: ['Groceries', 'Healthcare', 'Groceries'],
                });
                mockClaudeClient.chat.mockResolvedValue(claudeResponse);

                await service.assign('category', mockTransactions, validCategories);

                expect(promptTemplates.parseAssignmentResponse).toHaveBeenCalledWith(
                    'category',
                    claudeResponse,
                    3,
                    validCategories
                );
            });

            it('should work with budget assignment type', async () => {
                mockClaudeClient.chat.mockResolvedValue(
                    JSON.stringify({
                        budgets: ['Food', 'Medical', 'Food'],
                    })
                );
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    'Food',
                    'Medical',
                    'Food',
                ]);

                const result = await service.assign('budget', mockTransactions, validBudgets);

                expect(result).toEqual(['Food', 'Medical', 'Food']);
                expect(promptTemplates.getSystemPrompt).toHaveBeenCalledWith('budget');
            });

            it('should calculate success rate correctly for partial assignments', async () => {
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    'Groceries',
                    '(no category)',
                    'Shopping',
                ]);

                await service.assign('category', mockTransactions, validCategories);

                expect(mockLogger.info).toHaveBeenCalledWith(
                    {
                        type: 'category',
                        assignedCount: 3,
                        successRate: '66.7%', // 2 out of 3 are not "(no category)"
                    },
                    'category assignment completed'
                );
            });

            it('should calculate 0% success rate when all assignments are default', async () => {
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    '(no category)',
                    '(no category)',
                    '(no category)',
                ]);

                await service.assign('category', mockTransactions, validCategories);

                expect(mockLogger.info).toHaveBeenCalledWith(
                    {
                        type: 'category',
                        assignedCount: 3,
                        successRate: '0.0%',
                    },
                    'category assignment completed'
                );
            });
        });

        describe('error handling', () => {
            it('should return default categories on Claude API error', async () => {
                mockClaudeClient.chat.mockRejectedValue(new Error('API rate limit exceeded'));

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['(no category)', '(no category)', '(no category)']);
                expect(mockLogger.error).toHaveBeenCalledWith(
                    {
                        error: 'API rate limit exceeded',
                        type: 'category',
                        transactionCount: 3,
                    },
                    'category assignment failed'
                );
            });

            it('should return default budgets on Claude API error', async () => {
                mockClaudeClient.chat.mockRejectedValue(new Error('Network timeout'));

                const result = await service.assign('budget', mockTransactions, validBudgets);

                expect(result).toEqual(['(no budget)', '(no budget)', '(no budget)']);
                expect(mockLogger.error).toHaveBeenCalledWith(
                    {
                        error: 'Network timeout',
                        type: 'budget',
                        transactionCount: 3,
                    },
                    'budget assignment failed'
                );
            });

            it('should handle parsing errors gracefully', async () => {
                mockClaudeClient.chat.mockResolvedValue('Invalid JSON');
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockImplementation(() => {
                    throw new Error('Failed to parse response');
                });

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['(no category)', '(no category)', '(no category)']);
            });

            it('should handle non-Error objects thrown', async () => {
                mockClaudeClient.chat.mockRejectedValue('String error');

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['(no category)', '(no category)', '(no category)']);
                expect(mockLogger.error).toHaveBeenCalledWith(
                    {
                        error: 'String error',
                        type: 'category',
                        transactionCount: 3,
                    },
                    'category assignment failed'
                );
            });

            it('should handle response count mismatch by returning defaults', async () => {
                mockClaudeClient.chat.mockResolvedValue(
                    JSON.stringify({ categories: ['Groceries'] })
                );
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockImplementation(() => {
                    throw new Error('Expected 3 categories, got 1');
                });

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['(no category)', '(no category)', '(no category)']);
            });

            it('should handle invalid category in response by returning defaults', async () => {
                mockClaudeClient.chat.mockResolvedValue(
                    JSON.stringify({ categories: ['InvalidCategory', 'Groceries', 'Shopping'] })
                );
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockImplementation(() => {
                    throw new Error('Invalid category: InvalidCategory');
                });

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['(no category)', '(no category)', '(no category)']);
            });
        });

        describe('edge cases', () => {
            it('should handle single transaction', async () => {
                mockClaudeClient.chat.mockResolvedValue(
                    JSON.stringify({ categories: ['Groceries'] })
                );
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    'Groceries',
                ]);

                const result = await service.assign(
                    'category',
                    [mockTransactions[0]],
                    validCategories
                );

                expect(result).toEqual(['Groceries']);
                expect(mockLogger.info).toHaveBeenCalledWith(
                    {
                        type: 'category',
                        transactionCount: 1,
                        optionCount: 4,
                    },
                    'Starting category assignment'
                );
            });

            it('should handle large number of transactions', async () => {
                const manyTransactions = Array.from({ length: 100 }, (_, i) =>
                    createMockTransaction({
                        transaction_journal_id: String(i),
                        description: `Transaction ${i}`,
                    })
                );

                const assignments = Array.from({ length: 100 }, () => 'Groceries');
                mockClaudeClient.chat.mockResolvedValue(
                    JSON.stringify({ categories: assignments })
                );
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockReturnValue(
                    assignments
                );

                const result = await service.assign('category', manyTransactions, validCategories);

                expect(result).toHaveLength(100);
                expect(transactionMapper.mapTransactionForLLM).toHaveBeenCalledTimes(100);
            });

            it('should handle transactions with missing optional fields', async () => {
                const txWithMissingFields = createMockTransaction({
                    transaction_journal_id: '1',
                    description: 'Test',
                    source_name: undefined,
                    destination_name: null,
                    notes: null,
                });

                mockClaudeClient.chat.mockResolvedValue(
                    JSON.stringify({ categories: ['Shopping'] })
                );
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    'Shopping',
                ]);

                const result = await service.assign(
                    'category',
                    [txWithMissingFields],
                    validCategories
                );

                expect(result).toEqual(['Shopping']);
            });

            it('should handle single valid option', async () => {
                mockClaudeClient.chat.mockResolvedValue(
                    JSON.stringify({ categories: ['OnlyOption', 'OnlyOption', 'OnlyOption'] })
                );
                (promptTemplates.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    'OnlyOption',
                    'OnlyOption',
                    'OnlyOption',
                ]);

                const result = await service.assign('category', mockTransactions, [
                    'OnlyOption',
                    '(no category)',
                ]);

                expect(result).toEqual(['OnlyOption', 'OnlyOption', 'OnlyOption']);
            });
        });
    });

    describe('assignCategories', () => {
        it('should delegate to assign with category type', async () => {
            const assignSpy = jest.spyOn(service, 'assign').mockResolvedValue([
                'Groceries',
                'Healthcare',
                'Groceries',
            ]);

            const result = await service.assignCategories(mockTransactions, validCategories);

            expect(assignSpy).toHaveBeenCalledWith('category', mockTransactions, validCategories);
            expect(result).toEqual(['Groceries', 'Healthcare', 'Groceries']);

            assignSpy.mockRestore();
        });

        it('should return empty array when no transactions', async () => {
            const result = await service.assignCategories([], validCategories);

            expect(result).toEqual([]);
        });

        it('should handle errors from assign method', async () => {
            mockClaudeClient.chat.mockRejectedValue(new Error('API error'));

            const result = await service.assignCategories(mockTransactions, validCategories);

            expect(result).toEqual(['(no category)', '(no category)', '(no category)']);
        });
    });

    describe('assignBudgets', () => {
        it('should delegate to assign with budget type', async () => {
            const assignSpy = jest.spyOn(service, 'assign').mockResolvedValue([
                'Food',
                'Medical',
                'Food',
            ]);

            const result = await service.assignBudgets(mockTransactions, validBudgets);

            expect(assignSpy).toHaveBeenCalledWith('budget', mockTransactions, validBudgets);
            expect(result).toEqual(['Food', 'Medical', 'Food']);

            assignSpy.mockRestore();
        });

        it('should return empty array when no transactions', async () => {
            const result = await service.assignBudgets([], validBudgets);

            expect(result).toEqual([]);
        });

        it('should handle errors from assign method', async () => {
            mockClaudeClient.chat.mockRejectedValue(new Error('API error'));

            const result = await service.assignBudgets(mockTransactions, validBudgets);

            expect(result).toEqual(['(no budget)', '(no budget)', '(no budget)']);
        });
    });
});
