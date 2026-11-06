import { AITransactionUpdateOrchestrator } from '../../src/services/ai-transaction-update-orchestrator.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { CategoryService } from '../../src/services/core/category.service.js';
import { BudgetService } from '../../src/services/core/budget.service.js';
import {
    AIResponse,
    LLMTransactionProcessingService,
} from '../../src/services/ai/llm-transaction-processing.service.js';
import { LLMAssignmentService } from '../../src/services/ai/llm-assignment.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { TransactionValidatorService } from '../../src/services/core/transaction-validator.service.js';
import {
    InteractiveTransactionUpdater,
    PreparedUpdate,
} from '../../src/services/interactive-transaction-updater.service.js';
import { TransactionSplit, TransactionRead } from '@derekprovance/firefly-iii-sdk';
import { CategoryProperties } from '@derekprovance/firefly-iii-sdk';
import { BudgetRead } from '@derekprovance/firefly-iii-sdk';
import { createMockTransaction, deposit, withdrawal } from '../shared/test-data.js';
import { TransactionHistoryService } from '../../src/services/transaction-history.service.js';
import { ITransactionService } from '../../src/services/core/transaction.service.interface.js';
import { jest } from '@jest/globals';
import { CategorizeMode, CategorizeStatus } from '../../src/types/enums.js';

describe('AITransactionUpdateOrchestrator', () => {
    let service: AITransactionUpdateOrchestrator;
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockInteractiveTransactionUpdater: jest.Mocked<InteractiveTransactionUpdater>;
    let mockCategoryService: jest.Mocked<CategoryService>;
    let mockBudgetService: jest.Mocked<BudgetService>;
    let mockLLMService: jest.Mocked<LLMTransactionProcessingService>;
    let mockPropertyService: jest.Mocked<TransactionClassificationService>;
    let mockValidator: jest.Mocked<TransactionValidatorService>;
    let mockTransactions: Partial<TransactionSplit>[];
    let mockAIResults: { [key: string]: { category: string; budget: string } };

    const mockCategories: Partial<CategoryProperties>[] = [
        { name: 'New Category 1' },
        { name: 'New Category 2' },
    ];

    const mockBudgets: Partial<BudgetRead>[] = [
        { id: '1', type: 'budget', attributes: { name: 'New Budget 1' } },
        { id: '2', type: 'budget', attributes: { name: 'New Budget 2' } },
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        mockTransactions = [
            {
                transaction_journal_id: '1',
                description: 'Test Transaction 1',
                amount: '100.00',
                category_name: 'Old Category',
                budget_id: '1',
                budget_name: 'Old Budget',
                type: 'withdrawal',
                date: '2024-03-01',
                source_id: '1',
                destination_id: '2',
            },
            {
                transaction_journal_id: '2',
                description: 'Test Transaction 2',
                amount: '200.00',
                category_name: 'Old Category',
                budget_id: '2',
                budget_name: 'Old Budget',
                type: 'withdrawal',
                date: '2024-03-01',
                source_id: '1',
                destination_id: '2',
            },
        ];

        // Debug log for test isolation
        // console.log('beforeEach mockTransactions:', mockTransactions.length, JSON.stringify(mockTransactions));

        mockAIResults = {
            '1': { category: 'New Category 1', budget: 'New Budget 1' },
            '2': { category: 'New Category 2', budget: 'New Budget 2' },
        };

        mockTransactionService = {
            tagExists: jest.fn<(tag: string) => Promise<boolean>>(),
            getTransactionsByTag: jest
                .fn<(tag: string) => Promise<TransactionSplit[]>>()
                .mockResolvedValue(mockTransactions as TransactionSplit[]),
            updateTransaction:
                jest.fn<
                    (
                        transaction: TransactionSplit,
                        category?: string,
                        budgetId?: string
                    ) => Promise<TransactionRead | undefined>
                >(),
        } as unknown as jest.Mocked<TransactionService>;

        mockInteractiveTransactionUpdater = {
            // By default every suggestion validates and changes something, so
            // it reaches applyUpdate; tests override either step as needed
            prepareUpdate: jest.fn(async (transaction: TransactionSplit, aiResults: AIResponse) => {
                const journalId = transaction.transaction_journal_id;
                if (!journalId) {
                    return {
                        ok: false,
                        error: {
                            field: 'journalId',
                            message: 'Missing journal ID',
                            userMessage: 'Transaction missing journal ID',
                            transactionId: 'unknown',
                            transactionDescription: transaction.description || 'No description',
                        },
                    };
                }
                const aiResult = aiResults[journalId];
                return {
                    ok: true,
                    value: {
                        transaction,
                        journalId,
                        category: aiResult?.category ? { name: aiResult.category } : undefined,
                        budget: aiResult?.budget
                            ? { id: 'b', attributes: { name: aiResult.budget } }
                            : undefined,
                        source: aiResult?.source,
                    },
                };
            }),
            applyUpdate: jest.fn(async (update: PreparedUpdate) => {
                const result = {
                    ...update.transaction,
                    category_name: update.category?.name || update.transaction.category_name,
                    budget_name: update.budget?.attributes.name || update.transaction.budget_name,
                };
                return { ok: true, value: result };
            }),
        } as unknown as jest.Mocked<InteractiveTransactionUpdater>;

        mockCategoryService = {
            getCategories: jest.fn(),
        } as unknown as jest.Mocked<CategoryService>;

        mockBudgetService = {
            getBudgets: jest.fn(),
        } as unknown as jest.Mocked<BudgetService>;

        mockLLMService = {
            processTransactions: jest.fn(),
        } as unknown as jest.Mocked<LLMTransactionProcessingService>;

        mockPropertyService = {
            isBill: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isTransfer: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isDeposit: jest.fn<(transaction: TransactionSplit) => boolean>(),
        } as unknown as jest.Mocked<TransactionClassificationService>;

        mockValidator = {
            shouldProcessTransaction: jest.fn(),
            shouldSetBudget: jest.fn(),
            categoryOrBudgetChanged: jest.fn(),
            isBudgetOnlyCandidate: jest.fn(),
            transactionClassificationService: mockPropertyService,
        } as unknown as jest.Mocked<TransactionValidatorService>;

        // Mock the services directly
        jest.spyOn(
            TransactionValidatorService.prototype,
            'shouldProcessTransaction'
        ).mockImplementation(mockValidator.shouldProcessTransaction);
        jest.spyOn(TransactionValidatorService.prototype, 'shouldSetBudget').mockImplementation(
            mockValidator.shouldSetBudget
        );
        jest.spyOn(
            TransactionValidatorService.prototype,
            'categoryOrBudgetChanged'
        ).mockImplementation(mockValidator.categoryOrBudgetChanged);

        service = new AITransactionUpdateOrchestrator(
            mockTransactionService,
            mockInteractiveTransactionUpdater,
            mockCategoryService,
            mockBudgetService,
            mockLLMService,
            mockValidator
        );

        expect(
            (service as unknown as { transactionService: TransactionService }).transactionService
        ).toBe(mockTransactionService);

        mockValidator.shouldProcessTransaction.mockReturnValue(true);
        // The validator's budget rule: withdrawals may carry one, deposits not
        mockValidator.shouldSetBudget.mockImplementation(t => t.type !== 'deposit');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('updateTransactionsByTag', () => {
        it('should return NO_TAG status when tag does not exist', async () => {
            mockTransactionService.tagExists.mockResolvedValue(false);

            const result = await service.updateTransactionsByTag(
                'nonexistent',
                CategorizeMode.Both
            );

            expect(result.status).toBe(CategorizeStatus.NO_TAG);
            expect(result.transactionsUpdated).toBe(0);
        });

        it('should return EMPTY_TAG status when no transactions found', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([]);

            const result = await service.updateTransactionsByTag('empty', CategorizeMode.Both);

            expect(result.status).toBe(CategorizeStatus.EMPTY_TAG);
            expect(result.transactionsUpdated).toBe(0);
        });

        it('should process transactions and return HAS_RESULTS status', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[]
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as CategoryProperties[]
            );
            mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            // Dynamically generate mockAIResults to match filtered transactions
            const filtered = (mockTransactions as TransactionSplit[]).filter(t =>
                mockValidator.shouldProcessTransaction(t, false)
            );
            const dynamicAIResults = Object.fromEntries(
                filtered.map((t, idx) => [
                    t.transaction_journal_id!,
                    {
                        category: `New Category ${idx + 1}`,
                        budget: `New Budget ${idx + 1}`,
                    },
                ])
            );
            mockLLMService.processTransactions.mockResolvedValue(dynamicAIResults);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const result = await service.updateTransactionsByTag('test', CategorizeMode.Both);

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(mockInteractiveTransactionUpdater.applyUpdate).toHaveBeenCalledTimes(
                mockTransactions.length
            );
        });

        it('should handle processing failures and return PROCESSING_FAILED status', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockRejectedValue(
                new Error('Processing failed')
            );

            const result = await service.updateTransactionsByTag('test', CategorizeMode.Both);

            expect(result.status).toBe(CategorizeStatus.PROCESSING_FAILED);
            // No need to check totalTransactions or data - they don't exist in the DTO
            expect(result.error).toBe('Processing failed');
        });

        it('should skip transactions that are transfers', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[]
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as CategoryProperties[]
            );
            mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(false);

            const result = await service.updateTransactionsByTag('test', CategorizeMode.Both);

            expect(result.status).toBe(CategorizeStatus.EMPTY_TAG);
            expect(mockInteractiveTransactionUpdater.applyUpdate).not.toHaveBeenCalled();
        });

        it('should handle category-only update mode', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[]
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as CategoryProperties[]
            );
            mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.isBudgetOnlyCandidate.mockReturnValue(false);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockInteractiveTransactionUpdater.applyUpdate.mockResolvedValue({
                ok: true,
                value: mockTransactions[0] as any,
            });

            const result = await service.updateTransactionsByTag('test', CategorizeMode.Category);

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(mockBudgetService.getBudgets).not.toHaveBeenCalled();
            expect(mockLLMService.processTransactions).toHaveBeenCalledWith(
                expect.any(Array),
                expect.any(Array),
                undefined
            );
            expect(mockInteractiveTransactionUpdater.applyUpdate).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('should handle budget-only update mode', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[]
            );
            mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockInteractiveTransactionUpdater.applyUpdate.mockResolvedValue({
                ok: true,
                value: mockTransactions[0] as any,
            });

            const result = await service.updateTransactionsByTag('test', CategorizeMode.Budget);

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(mockCategoryService.getCategories).not.toHaveBeenCalled();
            expect(mockInteractiveTransactionUpdater.applyUpdate).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('should handle dry run mode correctly', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[]
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as CategoryProperties[]
            );
            mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const serviceWithDryRun = new AITransactionUpdateOrchestrator(
                mockTransactionService,
                mockInteractiveTransactionUpdater,
                mockCategoryService,
                mockBudgetService,
                mockLLMService,
                mockValidator,
                false
            );

            const result = await serviceWithDryRun.updateTransactionsByTag(
                'test',
                CategorizeMode.Both
            );

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            // No need to check totalTransactions or data - they don't exist in the DTO
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should show proposed changes in dry run mode', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[]
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as CategoryProperties[]
            );
            mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const serviceWithDryRun = new AITransactionUpdateOrchestrator(
                mockTransactionService,
                mockInteractiveTransactionUpdater,
                mockCategoryService,
                mockBudgetService,
                mockLLMService,
                mockValidator,
                false
            );

            const result = await serviceWithDryRun.updateTransactionsByTag(
                'test',
                CategorizeMode.Both
            );
            expect(result).toBeTruthy();
        });

        it('should combine dry run with no confirmation', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[]
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as CategoryProperties[]
            );
            mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const serviceWithBoth = new AITransactionUpdateOrchestrator(
                mockTransactionService,
                mockInteractiveTransactionUpdater,
                mockCategoryService,
                mockBudgetService,
                mockLLMService,
                mockValidator,
                false
            );

            const result = await serviceWithBoth.updateTransactionsByTag(
                'test',
                CategorizeMode.Both
            );

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should handle successful updates', async () => {
            const tag = 'test-tag';
            const updateMode = CategorizeMode.Both;

            const mockTransaction = createMockTransaction({
                transaction_journal_id: '1',
                description: 'Test Transaction',
                amount: '100.00',
            });

            const mockCategory: CategoryProperties = {
                name: 'Test Category',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
            };

            const mockBudget: BudgetRead = {
                id: '1',
                type: 'budget',
                attributes: {
                    name: 'Test Budget',
                    active: true,
                    order: 0,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                    spent: [],
                    auto_budget_type: null,
                    auto_budget_amount: null,
                    auto_budget_period: null,
                },
            };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([mockTransaction]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([mockCategory]);
            mockBudgetService.getBudgets.mockResolvedValue([mockBudget]);
            mockLLMService.processTransactions.mockResolvedValue({
                '1': { category: 'New Category', budget: 'New Budget' },
            });
            mockInteractiveTransactionUpdater.applyUpdate.mockResolvedValue({
                ok: true,
                value: mockTransaction as any,
            });

            const result = await service.updateTransactionsByTag(tag, updateMode);

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(mockTransactionService.tagExists).toHaveBeenCalledWith(tag);
            expect(mockTransactionService.getTransactionsByTag).toHaveBeenCalledWith(tag);
            expect(mockValidator.shouldProcessTransaction).toHaveBeenCalledWith(
                mockTransaction,
                false
            );
            expect(mockCategoryService.getCategories).toHaveBeenCalled();
            expect(mockBudgetService.getBudgets).toHaveBeenCalled();
            expect(mockLLMService.processTransactions).toHaveBeenCalledWith(
                [mockTransaction],
                [mockCategory.name],
                [mockBudget.attributes.name]
            );
            expect(mockInteractiveTransactionUpdater.prepareUpdate).toHaveBeenCalledWith(
                mockTransaction,
                {
                    '1': {
                        category: 'New Category',
                        budget: 'New Budget',
                        source: { category: 'ai', budget: 'ai' },
                    },
                }
            );
            expect(mockInteractiveTransactionUpdater.applyUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ transaction: mockTransaction }),
                { index: 1, total: 1 }
            );
        });

        it('should handle dry run mode', async () => {
            const tag = 'test-tag';
            const updateMode = CategorizeMode.Both;
            const dryRun = true;

            const mockTransaction = createMockTransaction({
                transaction_journal_id: '1',
                description: 'Test Transaction',
                amount: '100.00',
            });

            const mockCategory: CategoryProperties = {
                name: 'Test Category',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
            };

            const mockBudget: BudgetRead = {
                id: '1',
                type: 'budget',
                attributes: {
                    name: 'Test Budget',
                    active: true,
                    order: 0,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                    spent: [],
                    auto_budget_type: null,
                    auto_budget_amount: null,
                    auto_budget_period: null,
                },
            };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([mockTransaction]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([mockCategory]);
            mockBudgetService.getBudgets.mockResolvedValue([mockBudget]);
            mockLLMService.processTransactions.mockResolvedValue({
                '1': { category: 'New Category', budget: 'New Budget' },
            });
            mockInteractiveTransactionUpdater.applyUpdate.mockResolvedValue({
                ok: true,
                value: mockTransaction as any,
            });

            // dryRun is a constructor option, not a per-call argument
            const dryRunService = new AITransactionUpdateOrchestrator(
                mockTransactionService,
                mockInteractiveTransactionUpdater,
                mockCategoryService,
                mockBudgetService,
                mockLLMService,
                mockValidator,
                false,
                dryRun
            );
            const result = await dryRunService.updateTransactionsByTag(tag, updateMode);

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(mockTransactionService.tagExists).toHaveBeenCalledWith(tag);
            expect(mockTransactionService.getTransactionsByTag).toHaveBeenCalledWith(tag);
            expect(mockValidator.shouldProcessTransaction).toHaveBeenCalledWith(
                mockTransaction,
                false
            );
            expect(mockCategoryService.getCategories).toHaveBeenCalled();
            expect(mockBudgetService.getBudgets).toHaveBeenCalled();
            expect(mockLLMService.processTransactions).toHaveBeenCalledWith(
                [mockTransaction],
                [mockCategory.name],
                [mockBudget.attributes.name]
            );
            expect(mockInteractiveTransactionUpdater.prepareUpdate).toHaveBeenCalledWith(
                mockTransaction,
                {
                    '1': {
                        category: 'New Category',
                        budget: 'New Budget',
                        source: { category: 'ai', budget: 'ai' },
                    },
                }
            );
            expect(mockInteractiveTransactionUpdater.applyUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ transaction: mockTransaction }),
                { index: 1, total: 1 }
            );
        });

        it('should skip transactions with missing journal IDs during processing', async () => {
            const tag = 'test-tag';
            const updateMode = CategorizeMode.Both;

            const transactionWithoutId = {
                transaction_journal_id: undefined,
                description: 'Transaction without ID',
                amount: '100.00',
            };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                transactionWithoutId,
            ] as any);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([]);
            mockBudgetService.getBudgets.mockResolvedValue([]);

            mockLLMService.processTransactions.mockResolvedValue({
                dummy: { category: 'Test Category', budget: 'Test Budget' },
            });

            const result = await service.updateTransactionsByTag(tag, updateMode);

            expect(result.status).toBe(CategorizeStatus.EMPTY_TAG);
            expect(mockInteractiveTransactionUpdater.applyUpdate).not.toHaveBeenCalled();
        });

        it('should handle SIGINT interruption and stop processing transactions', async () => {
            const tag = 'test-tag';
            const updateMode = CategorizeMode.Both;

            const mockTransaction1 = createMockTransaction({
                transaction_journal_id: '1',
                description: 'Test Transaction 1',
                amount: '100.00',
            });

            const mockTransaction2 = createMockTransaction({
                transaction_journal_id: '2',
                description: 'Test Transaction 2',
                amount: '200.00',
            });

            const mockCategory: CategoryProperties = {
                name: 'Test Category',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
            };

            const mockBudget: BudgetRead = {
                id: '1',
                type: 'budget',
                attributes: {
                    name: 'Test Budget',
                    active: true,
                    order: 0,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                    spent: [],
                    auto_budget_type: null,
                    auto_budget_amount: null,
                    auto_budget_period: null,
                },
            };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                mockTransaction1,
                mockTransaction2,
            ]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([mockCategory]);
            mockBudgetService.getBudgets.mockResolvedValue([mockBudget]);
            mockLLMService.processTransactions.mockResolvedValue({
                '1': { category: 'New Category', budget: 'New Budget' },
                '2': { category: 'Another Category', budget: 'Another Budget' },
            });

            // First transaction succeeds, second fails with SIGINT
            mockInteractiveTransactionUpdater.applyUpdate
                .mockResolvedValueOnce({
                    ok: true,
                    value: mockTransaction1 as any,
                })
                .mockResolvedValueOnce({
                    ok: false,
                    error: {
                        field: 'user-interrupt',
                        message: 'User interrupted with SIGINT',
                        userMessage: 'Operation cancelled by user',
                        transactionId: '2',
                        transactionDescription: 'Test Transaction 2',
                    },
                });

            const result = await service.updateTransactionsByTag(tag, updateMode);

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(result.transactionsUpdated).toBe(1); // Only first transaction updated
            expect(result.transactionErrors).toBe(1); // Second transaction errored
            expect(mockInteractiveTransactionUpdater.applyUpdate).toHaveBeenCalledTimes(2);
        });

        it('numbers each prompted transaction, counting only those with a suggestion', async () => {
            const transactionWithoutId = createMockTransaction({
                transaction_journal_id: undefined,
                description: 'Transaction without ID',
            });
            const mockTransaction1 = createMockTransaction({ transaction_journal_id: '1' });
            const mockTransaction2 = createMockTransaction({ transaction_journal_id: '2' });

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                transactionWithoutId,
                mockTransaction1,
                mockTransaction2,
            ]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([
                { name: 'New Category' } as CategoryProperties,
            ]);
            mockBudgetService.getBudgets.mockResolvedValue([]);
            mockLLMService.processTransactions.mockResolvedValue({
                '1': { category: 'New Category' },
                '2': { category: 'New Category' },
            });
            mockInteractiveTransactionUpdater.applyUpdate.mockResolvedValue({
                ok: true,
                value: undefined,
            });

            await service.updateTransactionsByTag('test-tag', CategorizeMode.Category);

            const progress = mockInteractiveTransactionUpdater.applyUpdate.mock.calls.map(
                call => call[1]
            );
            expect(progress).toEqual([
                { index: 1, total: 2 },
                { index: 2, total: 2 },
            ]);
        });

        it('numbers only the prompts that survive validation', async () => {
            const unchanged = createMockTransaction({ transaction_journal_id: '1' });
            const invalid = createMockTransaction({ transaction_journal_id: '2' });
            const prompted = { ...createMockTransaction(), transaction_journal_id: '3' };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                unchanged,
                invalid,
                prompted,
            ]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([
                { name: 'New Category' } as CategoryProperties,
            ]);
            mockBudgetService.getBudgets.mockResolvedValue([]);
            mockLLMService.processTransactions.mockResolvedValue({
                '1': { category: 'New Category' },
                '2': { category: 'New Category' },
                '3': { category: 'New Category' },
            });
            const validationError = {
                field: 'category',
                message: 'Invalid category',
                userMessage: 'Invalid category',
                transactionId: '2',
                transactionDescription: 'invalid',
            };
            mockInteractiveTransactionUpdater.prepareUpdate
                .mockResolvedValueOnce({ ok: true, value: undefined })
                .mockResolvedValueOnce({ ok: false, error: validationError })
                .mockResolvedValueOnce({
                    ok: true,
                    value: { transaction: prompted, journalId: '3' },
                });
            mockInteractiveTransactionUpdater.applyUpdate.mockResolvedValue({
                ok: true,
                value: undefined,
            });
            jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await service.updateTransactionsByTag(
                'test-tag',
                CategorizeMode.Category
            );

            // Validation runs for all three before the first prompt, so the
            // one prompt shown is numbered 1 of 1, not 3 of 3
            expect(mockInteractiveTransactionUpdater.prepareUpdate).toHaveBeenCalledTimes(3);
            expect(mockInteractiveTransactionUpdater.applyUpdate).toHaveBeenCalledTimes(1);
            expect(mockInteractiveTransactionUpdater.applyUpdate).toHaveBeenCalledWith(
                expect.objectContaining({ journalId: '3' }),
                { index: 1, total: 1 }
            );
            expect(result.transactionErrors).toBe(1);
        });

        it('should handle validation errors and collect them properly', async () => {
            const tag = 'test-tag';
            const updateMode = CategorizeMode.Both;

            const mockTransaction1 = createMockTransaction({
                transaction_journal_id: '1',
                description: 'Test Transaction 1',
                amount: '100.00',
            });

            const mockTransaction2 = createMockTransaction({
                transaction_journal_id: '2',
                description: 'Test Transaction 2',
                amount: '200.00',
            });

            const mockCategory: CategoryProperties = {
                name: 'Test Category',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
            };

            const mockBudget: BudgetRead = {
                id: '1',
                type: 'budget',
                attributes: {
                    name: 'Test Budget',
                    active: true,
                    order: 0,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                    spent: [],
                    auto_budget_type: null,
                    auto_budget_amount: null,
                    auto_budget_period: null,
                },
            };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                mockTransaction1,
                mockTransaction2,
            ]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([mockCategory]);
            mockBudgetService.getBudgets.mockResolvedValue([mockBudget]);
            mockLLMService.processTransactions.mockResolvedValue({
                '1': { category: 'Invalid Category', budget: 'Test Budget' },
                '2': { category: 'Test Category', budget: 'Invalid Budget' },
            });

            // First transaction succeeds, second fails validation
            mockInteractiveTransactionUpdater.applyUpdate
                .mockResolvedValueOnce({
                    ok: true,
                    value: mockTransaction1 as any,
                })
                .mockResolvedValueOnce({
                    ok: false,
                    error: {
                        field: 'budget',
                        message: 'Invalid budget name',
                        userMessage: 'Budget "Invalid Budget" not found in Firefly III',
                        transactionId: '2',
                        transactionDescription: 'Test Transaction 2',
                        details: {
                            suggestedBudget: 'Invalid Budget',
                        },
                    },
                });

            // Spy on console.error to verify error display
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await service.updateTransactionsByTag(tag, updateMode);

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(result.transactionsUpdated).toBe(1);
            expect(result.transactionErrors).toBe(1);

            // Verify displayValidationErrors was called (console.error invocations)
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('1 transaction(s) failed validation')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Test Transaction 2')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Budget "Invalid Budget" not found in Firefly III')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Suggested: "Invalid Budget"')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Please check your categories and budgets in Firefly III.'
            );

            consoleErrorSpy.mockRestore();
        });

        it('should handle multiple validation errors and display all of them', async () => {
            const tag = 'test-tag';
            const updateMode = CategorizeMode.Both;

            const mockTransaction1 = createMockTransaction({
                transaction_journal_id: '1',
                description: 'Transaction One',
                amount: '100.00',
            });

            const mockTransaction2 = createMockTransaction({
                transaction_journal_id: '2',
                description: 'Transaction Two',
                amount: '200.00',
            });

            const mockTransaction3 = createMockTransaction({
                transaction_journal_id: '3',
                description: 'Transaction Three',
                amount: '300.00',
            });

            const mockCategory: CategoryProperties = {
                name: 'Test Category',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
            };

            const mockBudget: BudgetRead = {
                id: '1',
                type: 'budget',
                attributes: {
                    name: 'Test Budget',
                    active: true,
                    order: 0,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                    spent: [],
                    auto_budget_type: null,
                    auto_budget_amount: null,
                    auto_budget_period: null,
                },
            };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                mockTransaction1,
                mockTransaction2,
                mockTransaction3,
            ]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([mockCategory]);
            mockBudgetService.getBudgets.mockResolvedValue([mockBudget]);
            mockLLMService.processTransactions.mockResolvedValue({
                '1': { category: 'Invalid Category 1', budget: 'Test Budget' },
                '2': { category: 'Test Category', budget: 'Invalid Budget 2' },
                '3': { category: 'Test Category', budget: 'Test Budget' },
            });

            // First fails, second fails, third succeeds
            mockInteractiveTransactionUpdater.applyUpdate
                .mockResolvedValueOnce({
                    ok: false,
                    error: {
                        field: 'category',
                        message: 'Invalid category name',
                        userMessage: 'Category "Invalid Category 1" not found in Firefly III',
                        transactionId: '1',
                        transactionDescription: 'Transaction One',
                        details: {
                            suggestedCategory: 'Invalid Category 1',
                        },
                    },
                })
                .mockResolvedValueOnce({
                    ok: false,
                    error: {
                        field: 'budget',
                        message: 'Invalid budget name',
                        userMessage: 'Budget "Invalid Budget 2" not found in Firefly III',
                        transactionId: '2',
                        transactionDescription: 'Transaction Two',
                        details: {
                            suggestedBudget: 'Invalid Budget 2',
                        },
                    },
                })
                .mockResolvedValueOnce({
                    ok: true,
                    value: mockTransaction3 as any,
                });

            // Spy on console.error to verify error display
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await service.updateTransactionsByTag(tag, updateMode);

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(result.transactionsUpdated).toBe(1);
            expect(result.transactionErrors).toBe(2);

            // Verify both errors are displayed
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('2 transaction(s) failed validation')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Transaction One')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Transaction Two')
            );

            consoleErrorSpy.mockRestore();
        });

        it('should route transactions with category but no budget to budget-only AI processing', async () => {
            const tag = 'test-tag';
            const updateMode = CategorizeMode.Both;

            const transactionWithCategory = createMockTransaction({
                transaction_journal_id: '1',
                description: 'Has category, no budget',
                amount: '100.00',
                category_id: '1',
                category_name: 'Groceries',
                budget_id: undefined,
            });

            const transactionNormal = createMockTransaction({
                transaction_journal_id: '2',
                description: 'Has neither',
                amount: '200.00',
                category_id: undefined,
                budget_id: undefined,
            });

            const mockCategory: CategoryProperties = {
                name: 'Test Category',
                created_at: '2024-01-01T00:00:00Z',
                updated_at: '2024-01-01T00:00:00Z',
            };

            const mockBudget: BudgetRead = {
                id: '1',
                type: 'budget',
                attributes: {
                    name: 'Test Budget',
                    active: true,
                    order: 0,
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                    spent: [],
                    auto_budget_type: null,
                    auto_budget_amount: null,
                    auto_budget_period: null,
                },
            };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                transactionWithCategory,
                transactionNormal,
            ]);
            mockValidator.shouldProcessTransaction.mockImplementation(t => {
                // Both should be processed (one as budget-only, one as normal)
                return !mockPropertyService.isTransfer(t);
            });
            mockValidator.isBudgetOnlyCandidate.mockImplementation(t => {
                return t.transaction_journal_id === '1';
            });
            mockPropertyService.isTransfer.mockReturnValue(false);
            mockCategoryService.getCategories.mockResolvedValue([mockCategory]);
            mockBudgetService.getBudgets.mockResolvedValue([mockBudget]);

            mockLLMService.processTransactions.mockImplementation(async (txns, cats, budgets) => {
                // When called for budget-only transactions, categories should be undefined
                if (txns.length === 1 && txns[0].transaction_journal_id === '1') {
                    expect(cats).toBeUndefined();
                    expect(budgets).toBeDefined();
                }
                const all: AIResponse = {
                    '1': { budget: 'New Budget' },
                    '2': { category: 'New Category', budget: 'New Budget' },
                };
                return Object.fromEntries(
                    txns.map(t => [t.transaction_journal_id!, all[t.transaction_journal_id!]])
                );
            });

            mockInteractiveTransactionUpdater.applyUpdate.mockResolvedValue({
                ok: true,
                value: transactionNormal as any,
            });

            const result = await service.updateTransactionsByTag(tag, updateMode);

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            // Should call processTransactions twice: once for budget-only, once for normal
            expect(mockLLMService.processTransactions).toHaveBeenCalledTimes(2);
        });

        it('should leave budget-only candidates alone in category-only mode', async () => {
            const transactionWithCategory = createMockTransaction({
                transaction_journal_id: '1',
                description: 'Has category, no budget',
                amount: '100.00',
                category_id: '1',
                category_name: 'Groceries',
                budget_id: undefined,
            });

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                transactionWithCategory,
            ]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.isBudgetOnlyCandidate.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([]);
            mockBudgetService.getBudgets.mockResolvedValue([]);

            const result = await service.updateTransactionsByTag(
                'test-tag',
                CategorizeMode.Category
            );

            // --mode category must never write a budget
            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(result.transactionsUpdated).toBe(0);
            expect(mockBudgetService.getBudgets).not.toHaveBeenCalled();
            expect(mockLLMService.processTransactions).not.toHaveBeenCalled();
            expect(mockInteractiveTransactionUpdater.applyUpdate).not.toHaveBeenCalled();
        });

        it('should never ask for categories in budget-only mode', async () => {
            const [withCategory, withoutCategory] = [
                createMockTransaction({
                    transaction_journal_id: '1',
                    category_id: '1',
                    category_name: 'Groceries',
                    budget_id: undefined,
                }),
                createMockTransaction({ transaction_journal_id: '2', budget_id: undefined }),
            ];

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                withCategory,
                withoutCategory,
            ]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.isBudgetOnlyCandidate.mockImplementation(
                t => t.transaction_journal_id === '1'
            );
            mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
            mockLLMService.processTransactions.mockImplementation(async txns =>
                Object.fromEntries(txns.map(t => [t.transaction_journal_id!, { budget: 'B' }]))
            );

            await service.updateTransactionsByTag('test-tag', CategorizeMode.Budget);

            expect(mockCategoryService.getCategories).not.toHaveBeenCalled();
            // Both groups need only a budget, so they share one AI call
            expect(mockLLMService.processTransactions).toHaveBeenCalledTimes(1);
            const [sent, categories] = mockLLMService.processTransactions.mock.calls[0];
            expect(sent).toEqual([withCategory, withoutCategory]);
            expect(categories).toBeUndefined();
        });

        it('should fail the run when the AI layer hits a critical error', async () => {
            const assignmentService = {
                assignCategories: jest
                    .fn<LLMAssignmentService['assignCategories']>()
                    .mockRejectedValue(new Error('invalid x-api-key')),
                assignBudgets: jest.fn<LLMAssignmentService['assignBudgets']>(),
            } as unknown as LLMAssignmentService;
            const orchestrator = new AITransactionUpdateOrchestrator(
                mockTransactionService,
                mockInteractiveTransactionUpdater,
                mockCategoryService,
                mockBudgetService,
                new LLMTransactionProcessingService(assignmentService),
                mockValidator
            );

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockValidator.isBudgetOnlyCandidate.mockReturnValue(false);
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as CategoryProperties[]
            );
            mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);

            const result = await orchestrator.updateTransactionsByTag('test', CategorizeMode.Both);

            // Swallowed, this became HAS_RESULTS with "Updated 0 Transaction(s)!"
            expect(result.status).toBe(CategorizeStatus.PROCESSING_FAILED);
            expect(result.error).toBe('invalid x-api-key');
            expect(mockInteractiveTransactionUpdater.applyUpdate).not.toHaveBeenCalled();
        });
    });

    describe('history suggestions', () => {
        const categories = [{ name: 'Groceries' }, { name: 'Dining' }] as CategoryProperties[];
        const budgets = [
            { id: '1', type: 'budget', attributes: { name: 'Food' } },
            { id: '2', type: 'budget', attributes: { name: 'Fun' } },
        ] as BudgetRead[];

        const buildWithHistory = (past: TransactionSplit[]) => {
            const historySource = {
                getTransactionsInRange: jest.fn(async () => past),
            } as unknown as ITransactionService;
            return new AITransactionUpdateOrchestrator(
                mockTransactionService,
                mockInteractiveTransactionUpdater,
                mockCategoryService,
                mockBudgetService,
                mockLLMService,
                mockValidator,
                false,
                false,
                new TransactionHistoryService(historySource, 12, {
                    canCarryBudget: tx => tx.type === 'withdrawal',
                })
            );
        };

        const incoming = (id: string, description: string) =>
            withdrawal(10, {
                transaction_journal_id: id,
                description,
                category_name: null,
                budget_name: null,
            });

        const aiResultsPassed = () =>
            mockInteractiveTransactionUpdater.prepareUpdate.mock.calls[0][1] as AIResponse;

        beforeEach(() => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockValidator.isBudgetOnlyCandidate.mockReturnValue(false);
            mockCategoryService.getCategories.mockResolvedValue(categories);
            mockBudgetService.getBudgets.mockResolvedValue(budgets);
            mockLLMService.processTransactions.mockImplementation(async txns =>
                Object.fromEntries(
                    txns.map(t => [
                        t.transaction_journal_id!,
                        { category: 'Dining', budget: 'Fun' },
                    ])
                )
            );
        });

        it('uses a full history match without calling the AI', async () => {
            const tx = incoming('10', 'TRADER JOES #552');
            mockTransactionService.getTransactionsByTag.mockResolvedValue([tx]);
            const orchestrator = buildWithHistory([
                withdrawal(12, {
                    transaction_journal_id: '3',
                    description: 'Trader Joes #118',
                    category_name: 'Groceries',
                    budget_name: 'Food',
                }),
            ]);

            await orchestrator.updateTransactionsByTag('t', CategorizeMode.Both);

            expect(mockLLMService.processTransactions).not.toHaveBeenCalled();
            expect(aiResultsPassed()['10']).toEqual({
                category: 'Groceries',
                budget: 'Food',
                source: { category: 'history', budget: 'history' },
            });
        });

        it('keeps a merchant unbudgeted when its last match had no budget', async () => {
            const tx = incoming('10', 'COFFEE BAR');
            mockTransactionService.getTransactionsByTag.mockResolvedValue([tx]);
            const orchestrator = buildWithHistory([
                withdrawal(4, {
                    transaction_journal_id: '3',
                    description: 'Coffee Bar',
                    category_name: 'Dining',
                    budget_name: null,
                }),
            ]);

            await orchestrator.updateTransactionsByTag('t', CategorizeMode.Both);

            expect(mockLLMService.processTransactions).not.toHaveBeenCalled();
            expect(aiResultsPassed()['10']).toEqual({
                category: 'Dining',
                source: { category: 'history' },
            });
        });

        it('never asks for a budget on a deposit', async () => {
            const tx = deposit(10, {
                transaction_journal_id: '10',
                description: 'NEW EMPLOYER PAYROLL',
                category_name: null,
            });
            mockTransactionService.getTransactionsByTag.mockResolvedValue([tx]);
            const orchestrator = buildWithHistory([]);

            await orchestrator.updateTransactionsByTag('t', CategorizeMode.Both);

            expect(mockLLMService.processTransactions).toHaveBeenCalledTimes(1);
            const [sent, cats, buds] = mockLLMService.processTransactions.mock.calls[0];
            expect(sent).toEqual([tx]);
            expect(cats).toEqual(['Groceries', 'Dining']);
            expect(buds).toBeUndefined();
        });

        it('falls back to the AI when the remembered budget no longer exists', async () => {
            const tx = incoming('10', 'GYM');
            mockTransactionService.getTransactionsByTag.mockResolvedValue([tx]);
            const orchestrator = buildWithHistory([
                withdrawal(30, {
                    transaction_journal_id: '3',
                    description: 'Gym',
                    category_name: 'groceries',
                    budget_name: 'Deleted Budget',
                }),
            ]);

            await orchestrator.updateTransactionsByTag('t', CategorizeMode.Both);

            const [, cats, buds] = mockLLMService.processTransactions.mock.calls[0];
            expect(cats).toBeUndefined();
            expect(buds).toEqual(['Food', 'Fun']);
            // The history name is matched case-insensitively and canonicalized
            expect(aiResultsPassed()['10'].category).toBe('Groceries');
            expect(aiResultsPassed()['10'].source).toEqual({ category: 'history', budget: 'ai' });
        });

        it('fills only the budget of a budget-only candidate from history', async () => {
            const tx = withdrawal(10, {
                transaction_journal_id: '10',
                description: 'TRADER JOES',
                category_name: 'Dining',
                budget_name: null,
            });
            mockTransactionService.getTransactionsByTag.mockResolvedValue([tx]);
            mockValidator.isBudgetOnlyCandidate.mockReturnValue(true);
            const orchestrator = buildWithHistory([
                withdrawal(12, {
                    transaction_journal_id: '3',
                    description: 'Trader Joes',
                    category_name: 'Groceries',
                    budget_name: 'Food',
                }),
            ]);

            await orchestrator.updateTransactionsByTag('t', CategorizeMode.Both);

            expect(mockLLMService.processTransactions).not.toHaveBeenCalled();
            expect(aiResultsPassed()['10']).toEqual({
                budget: 'Food',
                source: { budget: 'history' },
            });
        });

        it('ignores history budgets in category mode', async () => {
            const tx = incoming('10', 'TRADER JOES');
            mockTransactionService.getTransactionsByTag.mockResolvedValue([tx]);
            const orchestrator = buildWithHistory([
                withdrawal(12, {
                    transaction_journal_id: '3',
                    description: 'Trader Joes',
                    category_name: 'Groceries',
                    budget_name: 'Food',
                }),
            ]);

            await orchestrator.updateTransactionsByTag('t', CategorizeMode.Category);

            expect(mockBudgetService.getBudgets).not.toHaveBeenCalled();
            expect(aiResultsPassed()['10']).toEqual({
                category: 'Groceries',
                source: { category: 'history' },
            });
        });

        it('asks the AI for a budget when the only match is a refund deposit', async () => {
            const tx = incoming('10', 'AMAZON MKTP US*EF3');
            mockTransactionService.getTransactionsByTag.mockResolvedValue([tx]);
            const orchestrator = buildWithHistory([
                // A deposit can never carry a budget (V8), so its missing
                // budget says nothing about what this withdrawal should get
                deposit(12, {
                    transaction_journal_id: '3',
                    description: 'AMAZON MKTP US*CD2',
                    category_name: 'Groceries',
                    budget_name: null,
                }),
            ]);

            await orchestrator.updateTransactionsByTag('t', CategorizeMode.Both);

            const [sent, cats, buds] = mockLLMService.processTransactions.mock.calls[0];
            expect(sent).toEqual([tx]);
            expect(cats).toBeUndefined();
            expect(buds).toEqual(['Food', 'Fun']);
            expect(aiResultsPassed()['10']).toEqual({
                category: 'Groceries',
                budget: 'Fun',
                source: { category: 'history', budget: 'ai' },
            });
        });

        it('never asks for a budget the validator would refuse (bill-linked)', async () => {
            const tx = incoming('10', 'RENT');
            mockTransactionService.getTransactionsByTag.mockResolvedValue([tx]);
            mockValidator.shouldSetBudget.mockReturnValue(false);
            const orchestrator = buildWithHistory([]);

            await orchestrator.updateTransactionsByTag('t', CategorizeMode.Both);

            const [sent, cats, buds] = mockLLMService.processTransactions.mock.calls[0];
            expect(sent).toEqual([tx]);
            expect(cats).toEqual(['Groceries', 'Dining']);
            expect(buds).toBeUndefined();
        });

        it('falls back to the AI when history cannot be loaded', async () => {
            const tx = incoming('10', 'TRADER JOES');
            mockTransactionService.getTransactionsByTag.mockResolvedValue([tx]);
            const historySource = {
                getTransactionsInRange: jest.fn(async () => {
                    throw new Error('Firefly timed out on page 7');
                }),
            } as unknown as ITransactionService;
            const orchestrator = new AITransactionUpdateOrchestrator(
                mockTransactionService,
                mockInteractiveTransactionUpdater,
                mockCategoryService,
                mockBudgetService,
                mockLLMService,
                mockValidator,
                false,
                false,
                new TransactionHistoryService(historySource, 12, {
                    canCarryBudget: tx => tx.type === 'withdrawal',
                })
            );

            const result = await orchestrator.updateTransactionsByTag('t', CategorizeMode.Both);

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(mockLLMService.processTransactions).toHaveBeenCalledTimes(1);
            expect(aiResultsPassed()['10']).toEqual({
                category: 'Dining',
                budget: 'Fun',
                source: { category: 'ai', budget: 'ai' },
            });
        });
    });
});
