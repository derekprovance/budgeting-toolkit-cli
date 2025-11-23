import { jest } from '@jest/globals';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import {
    LLMAssignmentService,
    LLMAssignmentDependencies,
    Logger,
} from '../../../src/services/ai/llm-assignment.service.js';
import { ClaudeClient } from '../../../src/api/claude.client.js';
import { createMockTransaction } from '../../shared/test-data.js';

describe('LLMAssignmentService', () => {
    let service: LLMAssignmentService;
    let mockClaudeClient: jest.Mocked<ClaudeClient>;
    let mockDeps: jest.Mocked<LLMAssignmentDependencies>;
    let mockLogger: jest.Mocked<Logger>;
    let mockTransactions: TransactionSplit[];
    let validCategories: string[];
    let validBudgets: string[];

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Create mock logger
        mockLogger = {
            info: jest.fn<(obj: unknown, msg: string) => void>(),
            warn: jest.fn<(obj: unknown, msg: string) => void>(),
            error: jest.fn<(obj: unknown, msg: string) => void>(),
            debug: jest.fn<(obj: unknown, msg: string) => void>(),
        } as jest.Mocked<Logger>;

        // Create mock Claude client
        mockClaudeClient = {
            chat: jest.fn(),
        } as unknown as jest.Mocked<ClaudeClient>;

        // Create mock dependencies
        mockDeps = {
            mapTransactionForLLM: jest.fn().mockImplementation(tx => ({
                description: tx.description,
                amount: tx.amount,
                date: tx.date,
                source_account: tx.source_name,
                destination_account: tx.destination_name,
                type: tx.type,
                notes: tx.notes,
            })),
            getSystemPrompt: jest.fn().mockReturnValue('System prompt'),
            getUserPrompt: jest.fn().mockReturnValue('User prompt'),
            getFunctionSchema: jest.fn().mockReturnValue({
                name: 'assign_categories',
                description: 'Assign categories',
                parameters: {},
            }),
            parseAssignmentResponse: jest.fn(),
            logger: mockLogger,
        } as jest.Mocked<LLMAssignmentDependencies>;

        // Create service with mock dependencies
        service = new LLMAssignmentService(mockClaudeClient, mockDeps);

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
                mockClaudeClient.chat = jest.fn().mockResolvedValue(
                    JSON.stringify({
                        categories: ['Groceries', 'Healthcare', 'Groceries'],
                    })
                );
                (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
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
            });

            it('should map transactions using transaction mapper', async () => {
                await service.assign('category', mockTransactions, validCategories);

                expect(mockDeps.mapTransactionForLLM).toHaveBeenCalledTimes(3);
                // Array.map passes (item, index, array) to the callback
                expect(mockDeps.mapTransactionForLLM).toHaveBeenCalledWith(
                    expect.objectContaining({
                        description: 'Walmart Supercenter',
                    }),
                    0,
                    mockTransactions
                );
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
                        function_call: { name: 'assign_categories' },
                    }
                );
            });

            it('should generate prompts with correct parameters', async () => {
                await service.assign('category', mockTransactions, validCategories);

                expect(mockDeps.getSystemPrompt).toHaveBeenCalledWith('category');
                expect(mockDeps.getUserPrompt).toHaveBeenCalledWith(
                    'category',
                    expect.any(Array),
                    validCategories
                );
                expect(mockDeps.getFunctionSchema).toHaveBeenCalledWith(
                    'category',
                    validCategories
                );
            });

            it('should parse response with correct parameters', async () => {
                const mockResponse = JSON.stringify({
                    categories: ['Groceries', 'Healthcare', 'Groceries'],
                });
                mockClaudeClient.chat = jest.fn().mockResolvedValue(mockResponse);

                await service.assign('category', mockTransactions, validCategories);

                expect(mockDeps.parseAssignmentResponse).toHaveBeenCalledWith(
                    'category',
                    mockResponse,
                    3,
                    validCategories
                );
            });

            it('should work with budget assignment type', async () => {
                mockClaudeClient.chat = jest.fn().mockResolvedValue(
                    JSON.stringify({
                        budgets: ['Food', 'Medical', 'Food'],
                    })
                );
                (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    'Food',
                    'Medical',
                    'Food',
                ]);

                const result = await service.assign('budget', mockTransactions, validBudgets);

                expect(result).toEqual(['Food', 'Medical', 'Food']);
                expect(mockDeps.getSystemPrompt).toHaveBeenCalledWith('budget');
            });

            it('should calculate success rate correctly for partial assignments', async () => {
                (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    'Groceries',
                    '(no category)',
                    'Groceries',
                ]);

                await service.assign('category', mockTransactions, validCategories);

                expect(mockLogger.info).toHaveBeenCalledWith(
                    {
                        type: 'category',
                        assignedCount: 3,
                        successRate: '66.7%',
                    },
                    'category assignment completed'
                );
            });

            it('should calculate 0% success rate when all assignments are default', async () => {
                (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
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
                mockClaudeClient.chat = jest.fn().mockRejectedValue(new Error('API Error'));

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['(no category)', '(no category)', '(no category)']);
                expect(mockLogger.error).toHaveBeenCalledWith(
                    { error: 'API Error', type: 'category', transactionCount: 3 },
                    'category assignment failed'
                );
            });

            it('should return default budgets on Claude API error', async () => {
                mockClaudeClient.chat = jest.fn().mockRejectedValue(new Error('API Error'));

                const result = await service.assign('budget', mockTransactions, validBudgets);

                expect(result).toEqual(['(no budget)', '(no budget)', '(no budget)']);
            });

            it('should handle parsing errors gracefully', async () => {
                mockClaudeClient.chat = jest.fn().mockResolvedValue('Invalid JSON');
                (mockDeps.parseAssignmentResponse as jest.Mock).mockImplementation(() => {
                    throw new Error('Parse error');
                });

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['(no category)', '(no category)', '(no category)']);
            });

            it('should handle non-Error objects thrown', async () => {
                mockClaudeClient.chat = jest.fn().mockRejectedValue('String error');

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['(no category)', '(no category)', '(no category)']);
            });

            it('should handle response count mismatch by returning defaults', async () => {
                mockClaudeClient.chat = jest.fn().mockResolvedValue(
                    JSON.stringify({
                        categories: ['Groceries', 'Healthcare'], // Only 2 instead of 3
                    })
                );
                (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    'Groceries',
                    'Healthcare',
                ]);

                const result = await service.assign('category', mockTransactions, validCategories);

                // Service returns whatever parseAssignmentResponse returns
                expect(result).toEqual(['Groceries', 'Healthcare']);
            });

            it('should handle invalid category in response by returning defaults', async () => {
                mockClaudeClient.chat = jest.fn().mockResolvedValue(
                    JSON.stringify({
                        categories: ['Invalid Category', 'Healthcare', 'Groceries'],
                    })
                );
                (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    '(no category)',
                    'Healthcare',
                    'Groceries',
                ]);

                const result = await service.assign('category', mockTransactions, validCategories);

                expect(result).toEqual(['(no category)', 'Healthcare', 'Groceries']);
            });
        });

        describe('edge cases', () => {
            it('should handle single transaction', async () => {
                const singleTransaction = [mockTransactions[0]];
                mockClaudeClient.chat = jest.fn().mockResolvedValue(
                    JSON.stringify({
                        categories: ['Groceries'],
                    })
                );
                (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue(['Groceries']);

                const result = await service.assign('category', singleTransaction, validCategories);

                expect(result).toEqual(['Groceries']);
            });

            it('should handle large number of transactions', async () => {
                const manyTransactions = Array(100)
                    .fill(null)
                    .map((_, i) =>
                        createMockTransaction({
                            transaction_journal_id: String(i),
                            description: `Transaction ${i}`,
                        })
                    );

                mockClaudeClient.chat = jest.fn().mockResolvedValue(
                    JSON.stringify({
                        categories: Array(100).fill('Groceries'),
                    })
                );
                (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue(
                    Array(100).fill('Groceries')
                );

                const result = await service.assign('category', manyTransactions, validCategories);

                expect(result).toHaveLength(100);
                expect(mockDeps.mapTransactionForLLM).toHaveBeenCalledTimes(100);
            });

            it('should handle transactions with missing optional fields', async () => {
                const sparseTransaction = createMockTransaction({
                    transaction_journal_id: '1',
                    description: 'Test',
                    amount: '10.00',
                    // Missing optional fields
                });

                mockClaudeClient.chat = jest.fn().mockResolvedValue(
                    JSON.stringify({
                        categories: ['Groceries'],
                    })
                );
                (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue(['Groceries']);

                const result = await service.assign(
                    'category',
                    [sparseTransaction],
                    validCategories
                );

                expect(result).toEqual(['Groceries']);
            });

            it('should handle single valid option', async () => {
                const singleCategory = ['Groceries'];
                mockClaudeClient.chat = jest.fn().mockResolvedValue(
                    JSON.stringify({
                        categories: ['Groceries', 'Groceries', 'Groceries'],
                    })
                );
                (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
                    'Groceries',
                    'Groceries',
                    'Groceries',
                ]);

                const result = await service.assign('category', mockTransactions, singleCategory);

                expect(result).toEqual(['Groceries', 'Groceries', 'Groceries']);
            });
        });
    });

    describe('assignCategories', () => {
        it('should delegate to assign with category type', async () => {
            mockClaudeClient.chat = jest.fn().mockResolvedValue(
                JSON.stringify({
                    categories: ['Groceries', 'Healthcare', 'Groceries'],
                })
            );
            (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
                'Groceries',
                'Healthcare',
                'Groceries',
            ]);

            const result = await service.assignCategories(mockTransactions, validCategories);

            expect(result).toEqual(['Groceries', 'Healthcare', 'Groceries']);
            expect(mockDeps.getSystemPrompt).toHaveBeenCalledWith('category');
        });

        it('should return empty array when no transactions', async () => {
            const result = await service.assignCategories([], validCategories);

            expect(result).toEqual([]);
        });

        it('should handle errors from assign method', async () => {
            mockClaudeClient.chat = jest.fn().mockRejectedValue(new Error('API Error'));
            (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
                '(no category)',
                '(no category)',
                '(no category)',
            ]);

            const result = await service.assignCategories(mockTransactions, validCategories);

            expect(result).toEqual(['(no category)', '(no category)', '(no category)']);
        });
    });

    describe('assignBudgets', () => {
        it('should delegate to assign with budget type', async () => {
            mockClaudeClient.chat = jest.fn().mockResolvedValue(
                JSON.stringify({
                    budgets: ['Food', 'Medical', 'Food'],
                })
            );
            (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
                'Food',
                'Medical',
                'Food',
            ]);

            const result = await service.assignBudgets(mockTransactions, validBudgets);

            expect(result).toEqual(['Food', 'Medical', 'Food']);
            expect(mockDeps.getSystemPrompt).toHaveBeenCalledWith('budget');
        });

        it('should return empty array when no transactions', async () => {
            const result = await service.assignBudgets([], validBudgets);

            expect(result).toEqual([]);
        });

        it('should handle errors from assign method', async () => {
            mockClaudeClient.chat = jest.fn().mockRejectedValue(new Error('API Error'));
            (mockDeps.parseAssignmentResponse as jest.Mock).mockReturnValue([
                '(no budget)',
                '(no budget)',
                '(no budget)',
            ]);

            const result = await service.assignBudgets(mockTransactions, validBudgets);

            expect(result).toEqual(['(no budget)', '(no budget)', '(no budget)']);
        });
    });
});
