jest.mock('../../src/logger', () => ({
    logger: {
        debug: (...args: unknown[]) => console.log('[logger.debug]', ...args),
        info: (...args: unknown[]) => console.log('[logger.info]', ...args),
        warn: (...args: unknown[]) => console.log('[logger.warn]', ...args),
        error: (...args: unknown[]) => console.log('[logger.error]', ...args),
        trace: (...args: unknown[]) => console.log('[logger.trace]', ...args),
    },
}));

jest.mock('../../src/services/core/transaction.service');
jest.mock('../../src/services/core/category.service');
jest.mock('../../src/services/core/budget.service');
jest.mock('../../src/services/ai/llm-transaction-processing.service');
jest.mock('../../src/services/core/transaction-classification.service');
jest.mock('../../src/services/core/transaction-validator.service');
jest.mock('../../src/services/core/transaction-ai-result-validator.service');
jest.mock('../../src/services/interactive-transaction-updater.service');

import { AITransactionUpdateOrchestrator } from '../../src/services/ai-transaction-update-orchestrator.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { CategoryService } from '../../src/services/core/category.service.js';
import { BudgetService } from '../../src/services/core/budget.service.js';
import { LLMTransactionProcessingService } from '../../src/services/ai/llm-transaction-processing.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { TransactionValidatorService } from '../../src/services/core/transaction-validator.service.js';
import { TransactionAIResultValidator } from '../../src/services/core/transaction-ai-result-validator.service.js';
import { InteractiveTransactionUpdater } from '../../src/services/interactive-transaction-updater.service.js';
import { UpdateTransactionMode } from '../../src/types/enum/update-transaction-mode.enum.js';
import { UpdateTransactionStatus } from '../../src/types/enum/update-transaction-status.enum.js';
import { TransactionSplit, TransactionRead } from '@derekprovance/firefly-iii-sdk';
import { CategoryProperties } from '@derekprovance/firefly-iii-sdk';
import { BudgetRead } from '@derekprovance/firefly-iii-sdk';
import { createMockTransaction } from '../shared/test-data.js';
import { jest } from '@jest/globals';

describe('AITransactionUpdateOrchestrator', () => {
    let service: AITransactionUpdateOrchestrator;
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockInteractiveTransactionUpdater: jest.Mocked<InteractiveTransactionUpdater>;
    let mockCategoryService: jest.Mocked<CategoryService>;
    let mockBudgetService: jest.Mocked<BudgetService>;
    let mockAIValidator: jest.Mocked<TransactionAIResultValidator>;
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
                .fn()
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
            updateTransaction: jest.fn().mockImplementation(async (transaction, aiResults) => {
                // Return Result with discriminated union pattern
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
                const result = {
                    ...transaction,
                    category_name: aiResult?.category || transaction.category_name,
                    budget_name: aiResult?.budget || transaction.budget_name,
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

        mockAIValidator = {
            initialize: jest.fn().mockResolvedValue(undefined),
            validateAIResults: jest.fn(),
            getCategoryByName: jest.fn(),
            getBudgetByName: jest.fn(),
            getAvailableCategoryNames: jest.fn().mockReturnValue([]),
            getAvailableBudgetNames: jest.fn().mockReturnValue([]),
            refresh: jest.fn(),
        } as unknown as jest.Mocked<TransactionAIResultValidator>;

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
            validateTransactionData: jest.fn(),
            categoryOrBudgetChanged: jest.fn(),
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
            'validateTransactionData'
        ).mockImplementation(mockValidator.validateTransactionData);
        jest.spyOn(
            TransactionValidatorService.prototype,
            'categoryOrBudgetChanged'
        ).mockImplementation(mockValidator.categoryOrBudgetChanged);

        service = new AITransactionUpdateOrchestrator(
            mockTransactionService,
            mockInteractiveTransactionUpdater,
            mockCategoryService,
            mockBudgetService,
            mockAIValidator,
            mockLLMService,
            mockValidator
        );

        expect(
            (service as unknown as { transactionService: TransactionService }).transactionService
        ).toBe(mockTransactionService);

        mockValidator.shouldProcessTransaction.mockReturnValue(true);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('updateTransactionsByTag', () => {
        it('should return NO_TAG status when tag does not exist', async () => {
            mockTransactionService.tagExists.mockResolvedValue(false);

            const result = await service.updateTransactionsByTag(
                'nonexistent',
                UpdateTransactionMode.Both
            );

            expect(result.status).toBe(UpdateTransactionStatus.NO_TAG);
            expect(result.transactionsUpdated).toBe(0);
        });

        it('should return EMPTY_TAG status when no transactions found', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([]);

            const result = await service.updateTransactionsByTag(
                'empty',
                UpdateTransactionMode.Both
            );

            expect(result.status).toBe(UpdateTransactionStatus.EMPTY_TAG);
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
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const result = await service.updateTransactionsByTag(
                'test',
                UpdateTransactionMode.Both
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(mockInteractiveTransactionUpdater.updateTransaction).toHaveBeenCalledTimes(
                mockTransactions.length
            );
        });

        it('should handle processing failures and return PROCESSING_FAILED status', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockRejectedValue(
                new Error('Processing failed')
            );

            const result = await service.updateTransactionsByTag(
                'test',
                UpdateTransactionMode.Both
            );

            expect(result.status).toBe(UpdateTransactionStatus.PROCESSING_FAILED);
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

            const result = await service.updateTransactionsByTag(
                'test',
                UpdateTransactionMode.Both
            );

            expect(result.status).toBe(UpdateTransactionStatus.EMPTY_TAG);
            expect(mockInteractiveTransactionUpdater.updateTransaction).not.toHaveBeenCalled();
        });

        it('should handle category-only update mode', async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[]
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as CategoryProperties[]
            );
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockInteractiveTransactionUpdater.updateTransaction.mockResolvedValue({
                ok: true,
                value: mockTransactions[0] as any,
            });

            const result = await service.updateTransactionsByTag(
                'test',
                UpdateTransactionMode.Category
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(mockBudgetService.getBudgets).not.toHaveBeenCalled();
            expect(mockInteractiveTransactionUpdater.updateTransaction).toHaveBeenCalledWith(
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
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockInteractiveTransactionUpdater.updateTransaction.mockResolvedValue({
                ok: true,
                value: mockTransactions[0] as any,
            });

            const result = await service.updateTransactionsByTag(
                'test',
                UpdateTransactionMode.Budget
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(mockCategoryService.getCategories).not.toHaveBeenCalled();
            expect(mockInteractiveTransactionUpdater.updateTransaction).toHaveBeenCalledWith(
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
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const serviceWithDryRun = new AITransactionUpdateOrchestrator(
                mockTransactionService,
                mockInteractiveTransactionUpdater,
                mockCategoryService,
                mockBudgetService,
                mockAIValidator,
                mockLLMService,
                mockValidator,
                false
            );

            const result = await serviceWithDryRun.updateTransactionsByTag(
                'test',
                UpdateTransactionMode.Both
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
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
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const serviceWithDryRun = new AITransactionUpdateOrchestrator(
                mockTransactionService,
                mockInteractiveTransactionUpdater,
                mockCategoryService,
                mockBudgetService,
                mockAIValidator,
                mockLLMService,
                mockValidator,
                false
            );

            const result = await serviceWithDryRun.updateTransactionsByTag(
                'test',
                UpdateTransactionMode.Both
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
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const serviceWithBoth = new AITransactionUpdateOrchestrator(
                mockTransactionService,
                mockInteractiveTransactionUpdater,
                mockCategoryService,
                mockBudgetService,
                mockAIValidator,
                mockLLMService,
                mockValidator,
                false
            );

            const result = await serviceWithBoth.updateTransactionsByTag(
                'test',
                UpdateTransactionMode.Both
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should handle successful updates', async () => {
            const tag = 'test-tag';
            const updateMode = UpdateTransactionMode.Both;
            const dryRun = false;

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
            mockInteractiveTransactionUpdater.updateTransaction.mockResolvedValue({
                ok: true,
                value: mockTransaction as any,
            });

            const result = await service.updateTransactionsByTag(tag, updateMode, dryRun);

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
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
            expect(mockInteractiveTransactionUpdater.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                {
                    '1': { category: 'New Category', budget: 'New Budget' },
                }
            );
        });

        it('should handle dry run mode', async () => {
            const tag = 'test-tag';
            const updateMode = UpdateTransactionMode.Both;
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
            mockInteractiveTransactionUpdater.updateTransaction.mockResolvedValue({
                ok: true,
                value: mockTransaction as any,
            });

            const result = await service.updateTransactionsByTag(tag, updateMode, dryRun);

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
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
            expect(mockInteractiveTransactionUpdater.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                {
                    '1': { category: 'New Category', budget: 'New Budget' },
                }
            );
        });

        it('should skip transactions with missing journal IDs during processing', async () => {
            const tag = 'test-tag';
            const updateMode = UpdateTransactionMode.Both;

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

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(mockInteractiveTransactionUpdater.updateTransaction).not.toHaveBeenCalled();
        });
    });
});
