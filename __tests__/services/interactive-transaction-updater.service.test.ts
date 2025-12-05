import { InteractiveTransactionUpdater } from '../../src/services/interactive-transaction-updater.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { TransactionValidatorService } from '../../src/services/core/transaction-validator.service.js';
import { TransactionAIResultValidator } from '../../src/services/core/transaction-ai-result-validator.service.js';
import { UserInputService } from '../../src/services/user-input.service.js';
import {
    TransactionSplit,
    CategoryProperties,
    BudgetRead,
    TransactionRead,
} from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';
import { CategorizeMode, EditTransactionAttribute } from '../../src/types/enums.js';

// Mock the logger to prevent console output during tests
jest.mock('../../src/logger', () => ({
    logger: {
        debug: jest.fn<(obj: unknown, msg: string) => void>(),
        warn: jest.fn<(obj: unknown, msg: string) => void>(),
        error: jest.fn<(obj: unknown, msg: string) => void>(),
        trace: jest.fn<(obj: unknown, msg: string) => void>(),
    },
}));

jest.mock('../../src/services/core/transaction.service');
jest.mock('../../src/services/core/transaction-validator.service');
jest.mock('../../src/services/core/transaction-ai-result-validator.service');
jest.mock('../../src/services/user-input.service');

describe('InteractiveTransactionUpdater', () => {
    let service: InteractiveTransactionUpdater;
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockValidator: jest.Mocked<TransactionValidatorService>;
    let mockAIValidator: jest.Mocked<TransactionAIResultValidator>;
    let mockUserInputService: jest.Mocked<UserInputService>;

    const mockTransaction: Partial<TransactionSplit> = {
        transaction_journal_id: '1',
        description: 'Test Transaction',
        amount: '100.00',
        category_name: 'Old Category',
        budget_id: '1',
        budget_name: 'Old Budget',
    };

    const mockCategories: Partial<CategoryProperties>[] = [{ name: 'New Category' }];

    const mockBudgets: Partial<BudgetRead>[] = [
        { id: '2', type: 'budget', attributes: { name: 'New Budget' } },
    ];

    const mockAIResults = {
        '1': { category: 'New Category', budget: 'New Budget' },
    };

    beforeEach(() => {
        mockTransactionService = {
            updateTransaction:
                jest.fn<
                    (
                        transaction: TransactionSplit,
                        category?: string,
                        budgetId?: string
                    ) => Promise<TransactionRead | undefined>
                >(),
            getTransactionReadBySplit:
                jest.fn<(splitTransaction: TransactionSplit) => TransactionRead | undefined>(),
        } as unknown as jest.Mocked<TransactionService>;

        mockValidator = {
            validateTransactionData: jest.fn(),
            shouldSetBudget: jest.fn(),
            categoryOrBudgetChanged: jest.fn(),
        } as unknown as jest.Mocked<TransactionValidatorService>;

        mockUserInputService = {
            askToUpdateTransaction: jest.fn().mockResolvedValue(CategorizeMode.Both),
            shouldEditCategoryBudget: jest.fn(),
            getNewCategory: jest.fn(),
            getNewBudget: jest.fn(),
        } as unknown as jest.Mocked<UserInputService>;

        mockAIValidator = {
            initialize: jest.fn().mockResolvedValue(undefined),
            validateAIResults: jest.fn().mockImplementation(async () => {
                // Default: return success with the mock categories/budgets
                return {
                    ok: true,
                    value: {
                        category: mockCategories[0],
                        budget: mockBudgets[0],
                    },
                };
            }),
            getCategoryByName: jest.fn(),
            getBudgetByName: jest.fn(),
            getAvailableCategoryNames: jest.fn().mockReturnValue(mockCategories.map(c => c.name)),
            getAvailableBudgetNames: jest
                .fn()
                .mockReturnValue(mockBudgets.map(b => b.attributes.name)),
            refresh: jest.fn(),
        } as unknown as jest.Mocked<TransactionAIResultValidator>;

        service = new InteractiveTransactionUpdater(
            mockTransactionService,
            mockValidator,
            mockAIValidator,
            mockUserInputService,
            false
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('updateTransaction', () => {
        it('should return error when transaction data is invalid', async () => {
            mockValidator.validateTransactionData.mockReturnValue(false);

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe('transaction');
                expect(result.error.userMessage).toContain('incomplete or invalid');
            }
            expect(mockValidator.validateTransactionData).toHaveBeenCalledWith(
                mockTransaction,
                mockAIResults
            );
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should update transaction with new category and budget when all conditions are met', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(CategorizeMode.Both);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                'New Category',
                '2'
            );
        });

        it('should return error when transaction has no journal ID', async () => {
            const transactionWithoutId = {
                ...mockTransaction,
                transaction_journal_id: undefined,
            };

            // Mock validates transaction data as true so we hit the journal ID check
            mockValidator.validateTransactionData.mockReturnValue(true);

            const result = await service.updateTransaction(
                transactionWithoutId as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe('journalId');
            }
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should not update budget when shouldSetBudget returns false', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(false);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            // AIValidator returns category but not budget when shouldSetBudget is false
            mockAIValidator.validateAIResults.mockResolvedValueOnce({
                ok: true,
                value: {
                    category: mockCategories[0],
                    budget: undefined, // shouldSetBudget returned false
                },
            });
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(CategorizeMode.Both);
            mockTransactionService.updateTransaction.mockResolvedValue(undefined);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            await service.updateTransaction(mockTransaction as TransactionSplit, mockAIResults);

            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                'New Category',
                undefined
            );
        });

        it('should return ok with undefined when no changes are detected', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(false);

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBeUndefined();
            }
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should return ok with undefined when user rejects the update', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(CategorizeMode.Skip);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBeUndefined();
            }
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should skip user confirmation when in dry run mode', async () => {
            const serviceWithDryRun = new InteractiveTransactionUpdater(
                mockTransactionService,
                mockValidator,
                mockAIValidator,
                mockUserInputService,
                true
            );

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await serviceWithDryRun.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockUserInputService.askToUpdateTransaction).not.toHaveBeenCalled();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should handle errors during update', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockTransactionService.updateTransaction.mockRejectedValue(new Error('Update failed'));
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain('Update failed');
            }
        });

        it('should return transaction without updating when in dry run mode', async () => {
            const serviceWithDryRun = new InteractiveTransactionUpdater(
                mockTransactionService,
                mockValidator,
                mockAIValidator,
                mockUserInputService,
                true
            );

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await serviceWithDryRun.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockUserInputService.askToUpdateTransaction).not.toHaveBeenCalled();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should skip validation in dry run mode if transaction data is invalid', async () => {
            const serviceWithDryRun = new InteractiveTransactionUpdater(
                mockTransactionService,
                mockValidator,
                mockAIValidator,
                mockUserInputService,
                true
            );

            mockValidator.validateTransactionData.mockReturnValue(false);

            const result = await serviceWithDryRun.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe('transaction');
            }
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should combine dry run with no confirmation', async () => {
            const serviceWithBoth = new InteractiveTransactionUpdater(
                mockTransactionService,
                mockValidator,
                mockAIValidator,
                mockUserInputService,
                true
            );

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await serviceWithBoth.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockUserInputService.askToUpdateTransaction).not.toHaveBeenCalled();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should return error when AI provides empty category', async () => {
            const aiResultsWithEmptyCategory = {
                '1': { category: '', budget: 'New Budget' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockAIValidator.validateAIResults.mockResolvedValue({
                ok: false,
                error: {
                    field: 'category',
                    message: 'Empty category',
                    userMessage: 'Category cannot be empty',
                    transactionId: '1',
                    transactionDescription: 'Test Transaction',
                },
            });

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithEmptyCategory
            );

            expect(result.ok).toBe(false);
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should return error when AI provides invalid category', async () => {
            const aiResultsWithInvalidCategory = {
                '1': { category: 'Invalid Category', budget: 'New Budget' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockAIValidator.validateAIResults.mockResolvedValue({
                ok: false,
                error: {
                    field: 'category',
                    message: 'Invalid category',
                    userMessage: 'Category does not exist',
                    transactionId: '1',
                    transactionDescription: 'Test Transaction',
                },
            });

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithInvalidCategory
            );

            expect(result.ok).toBe(false);
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should return error when AI provides empty budget', async () => {
            const aiResultsWithEmptyBudget = {
                '1': { category: 'New Category', budget: '' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockAIValidator.validateAIResults.mockResolvedValue({
                ok: false,
                error: {
                    field: 'budget',
                    message: 'Empty budget',
                    userMessage: 'Budget cannot be empty',
                    transactionId: '1',
                    transactionDescription: 'Test Transaction',
                },
            });

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithEmptyBudget
            );

            expect(result.ok).toBe(false);
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should return error when AI provides invalid budget', async () => {
            const aiResultsWithInvalidBudget = {
                '1': { category: 'New Category', budget: 'Invalid Budget' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockAIValidator.validateAIResults.mockResolvedValue({
                ok: false,
                error: {
                    field: 'budget',
                    message: 'Invalid budget',
                    userMessage: 'Budget does not exist',
                    transactionId: '1',
                    transactionDescription: 'Test Transaction',
                },
            });

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithInvalidBudget
            );

            expect(result.ok).toBe(false);
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should handle edit mode workflow', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(CategorizeMode.Edit)
                .mockResolvedValueOnce(CategorizeMode.Both);
            mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                EditTransactionAttribute.Category,
                EditTransactionAttribute.Budget,
            ]);
            mockUserInputService.getNewCategory.mockResolvedValue(
                mockCategories[0] as CategoryProperties
            );
            mockUserInputService.getNewBudget.mockResolvedValue(mockBudgets[0] as BudgetRead);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledTimes(2);
            expect(mockUserInputService.shouldEditCategoryBudget).toHaveBeenCalled();
            expect(mockUserInputService.getNewCategory).toHaveBeenCalledWith(
                mockCategories.map(c => c.name),
                'New Category', // Current value (initially AI suggestion)
                'New Category' // AI suggestion
            );
            expect(mockUserInputService.getNewBudget).toHaveBeenCalledWith(
                mockBudgets.map(b => b.attributes.name),
                'New Budget', // Current value (initially AI suggestion)
                'New Budget' // AI suggestion
            );
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                'New Category',
                '2'
            );
        });

        it('should handle edit mode with only category change', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(CategorizeMode.Edit)
                .mockResolvedValueOnce(CategorizeMode.Both);
            mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                EditTransactionAttribute.Category,
            ]);
            mockUserInputService.getNewCategory.mockResolvedValue(
                mockCategories[0] as CategoryProperties
            );
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledTimes(2);
            expect(mockUserInputService.shouldEditCategoryBudget).toHaveBeenCalled();
            expect(mockUserInputService.getNewCategory).toHaveBeenCalledWith(
                mockCategories.map(c => c.name),
                'New Category', // Current value (initially AI suggestion)
                'New Category' // AI suggestion
            );
            expect(mockUserInputService.getNewBudget).not.toHaveBeenCalled();
            // Budget should be preserved from LLM recommendation (mockBudgets[0].id = '2')
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                'New Category',
                '2'
            );
        });

        it('should handle edit mode with only budget change', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(CategorizeMode.Edit)
                .mockResolvedValueOnce(CategorizeMode.Both);
            mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                EditTransactionAttribute.Budget,
            ]);
            mockUserInputService.getNewBudget.mockResolvedValue(mockBudgets[0] as BudgetRead);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledTimes(2);
            expect(mockUserInputService.shouldEditCategoryBudget).toHaveBeenCalled();
            expect(mockUserInputService.getNewCategory).not.toHaveBeenCalled();
            expect(mockUserInputService.getNewBudget).toHaveBeenCalledWith(
                mockBudgets.map(b => b.attributes.name),
                'New Budget', // Current value (initially AI suggestion)
                'New Budget' // AI suggestion
            );
            // Category should be preserved from LLM recommendation (mockCategories[0].name = 'New Category')
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                'New Category',
                '2'
            );
        });

        it('should handle multiple edit cycles', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(CategorizeMode.Edit)
                .mockResolvedValueOnce(CategorizeMode.Edit)
                .mockResolvedValueOnce(CategorizeMode.Both);
            mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                EditTransactionAttribute.Category,
            ]);
            mockUserInputService.getNewCategory.mockResolvedValue(
                mockCategories[0] as CategoryProperties
            );
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledTimes(3);
            expect(mockUserInputService.shouldEditCategoryBudget).toHaveBeenCalledTimes(2);
            expect(mockUserInputService.getNewCategory).toHaveBeenCalledTimes(2);
        });

        it('should preserve original AI suggestions through multiple edit cycles', async () => {
            // Setup: AI suggests "New Category" and "New Budget"
            const aiCategory = mockCategories[0] as CategoryProperties; // "New Category"
            const aiBudget = mockBudgets[0]; // "New Budget"
            const userSelectedCategory = { name: 'Groceries' } as CategoryProperties; // User's first edit

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            // First prompt: user chooses to edit
            // Second prompt: user edits again (this is where we verify AI suggestion is preserved)
            // Third prompt: user confirms final selection
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(CategorizeMode.Edit)
                .mockResolvedValueOnce(CategorizeMode.Edit)
                .mockResolvedValueOnce(CategorizeMode.Both);

            mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                EditTransactionAttribute.Category,
            ]);

            // First edit: user selects "Groceries"
            // Second edit: user selects something else
            mockUserInputService.getNewCategory
                .mockResolvedValueOnce(userSelectedCategory)
                .mockResolvedValueOnce(aiCategory);

            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(mockTransaction as TransactionSplit, {
                '1': {
                    category: aiCategory.name,
                    budget: aiBudget.attributes.name,
                },
            });

            expect(result.ok).toBe(true);

            // Verify getNewCategory was called twice
            expect(mockUserInputService.getNewCategory).toHaveBeenCalledTimes(2);

            // First call: current value is AI suggestion, AI suggestion is same
            expect(mockUserInputService.getNewCategory).toHaveBeenNthCalledWith(
                1,
                expect.any(Array),
                aiCategory.name, // current value (AI's original suggestion)
                aiCategory.name // AI suggestion
            );

            // Second call: current value is user's selection from first edit,
            // but AI suggestion should still be the original AI value
            expect(mockUserInputService.getNewCategory).toHaveBeenNthCalledWith(
                2,
                expect.any(Array),
                userSelectedCategory.name, // current value (user's first edit)
                aiCategory.name // AI suggestion (preserved from original)
            );
        });

        it('should handle undefined category from AI (no category provided)', async () => {
            const aiResultsWithUndefinedCategory = {
                '1': { budget: 'New Budget' }, // No category field
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(CategorizeMode.Budget);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithUndefinedCategory
            );

            // This should now work as a budget-only update
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                undefined, // No category
                '2' // Budget ID
            );
        });

        it('should run budget validation even when category validation fails', async () => {
            const aiResultsWithBadCategory = {
                '1': { category: 'Nonexistent Category', budget: 'New Budget' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            // AIValidator returns category undefined (failed) but valid budget
            mockAIValidator.validateAIResults.mockResolvedValueOnce({
                ok: true,
                value: {
                    category: undefined,
                    budget: mockBudgets[0],
                },
            });
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(CategorizeMode.Budget);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithBadCategory
            );

            // This should work as a budget-only update since category failed but budget succeeded
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            // Budget validation runs independently of category validation
            // categoryOrBudgetChanged is called with undefined category and valid budget
            expect(mockValidator.categoryOrBudgetChanged).toHaveBeenCalledWith(
                mockTransaction,
                undefined,
                mockBudgets[0]
            );
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                undefined, // Invalid category becomes undefined
                '2' // Valid budget
            );
        });

        it('should handle budget validation when shouldSetBudget returns false', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(false); // Budget should not be set
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            // AIValidator returns category but no budget when shouldSetBudget is false
            mockAIValidator.validateAIResults.mockResolvedValueOnce({
                ok: true,
                value: {
                    category: mockCategories[0],
                    budget: undefined,
                },
            });
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(CategorizeMode.Both);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                'New Category',
                undefined // Budget should be undefined when shouldSetBudget is false
            );
        });

        it('should successfully proceed when category is valid but budget validation is skipped', async () => {
            const aiResultsWithValidCategoryOnly = {
                '1': { category: 'New Category' }, // No budget field
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(false); // No budget needed
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(CategorizeMode.Category);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithValidCategoryOnly
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                'New Category',
                undefined
            );
        });

        it('should successfully handle budget-only updates (bug is now fixed)', async () => {
            const aiResultsWithValidBudgetOnly = {
                '1': { budget: 'New Budget' }, // Only budget, no category - now works correctly
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            // AIValidator returns only budget, no category
            mockAIValidator.validateAIResults.mockResolvedValueOnce({
                ok: true,
                value: {
                    category: undefined,
                    budget: mockBudgets[0],
                },
            });
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(CategorizeMode.Budget);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithValidBudgetOnly
            );

            // Fixed: Budget-only updates now work correctly
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }

            // Budget validation should run since it's independent of category validation
            expect(mockValidator.categoryOrBudgetChanged).toHaveBeenCalledWith(
                mockTransaction,
                undefined,
                mockBudgets[0]
            );
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                undefined, // No category
                '2' // Budget ID
            );
        });

        it('should handle error return types consistently with Result types', async () => {
            const aiResultsWithEmptyCategory = {
                '1': { category: '', budget: 'New Budget' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            // Configure AI validator to return error for empty category
            mockAIValidator.validateAIResults.mockResolvedValueOnce({
                ok: false,
                error: {
                    field: 'category',
                    message: 'Empty category',
                    userMessage: 'Category cannot be empty',
                    transactionId: '1',
                    transactionDescription: 'Test Transaction',
                },
            });

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithEmptyCategory
            );

            // With Result types, all returns are now consistent
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe('category');
            }
        });

        it('should support budget-only updates (TODO resolved)', async () => {
            // The TODO comment has been resolved - budget-only updates now work

            const aiResultsWithOnlyBudget = {
                '1': { budget: 'New Budget' }, // No category provided
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            // Configure AIValidator to return only budget, no category
            mockAIValidator.validateAIResults.mockResolvedValueOnce({
                ok: true,
                value: {
                    category: undefined,
                    budget: mockBudgets[0],
                },
            });
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(CategorizeMode.Budget);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithOnlyBudget
            );

            // Budget-only updates are now supported
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(mockTransaction);
            }
            expect(mockValidator.categoryOrBudgetChanged).toHaveBeenCalledWith(
                mockTransaction,
                undefined,
                mockBudgets[0]
            );
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                undefined,
                '2'
            );
        });

        it('should resolve user-selected budget to full object with valid ID', async () => {
            // Setup: Mock user selecting a budget in edit mode
            const minimalBudget = { id: '', attributes: { name: 'New Budget' } } as BudgetRead;
            const fullBudget = { id: '2', attributes: { name: 'New Budget' } } as BudgetRead;

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(CategorizeMode.Edit)
                .mockResolvedValueOnce(CategorizeMode.Both);
            mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                EditTransactionAttribute.Budget,
            ]);
            mockUserInputService.getNewBudget.mockResolvedValue(minimalBudget);
            mockAIValidator.getBudgetByName.mockReturnValue(fullBudget);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            // Execute
            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            // Verify: updateTransaction receives full budget with valid ID
            expect(result.ok).toBe(true);
            expect(mockAIValidator.getBudgetByName).toHaveBeenCalledWith('New Budget');
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                expect.anything(),
                expect.anything(),
                '2' // ✅ Valid budget ID, not empty string
            );
        });

        it('should use user-selected category name directly (no resolution needed)', async () => {
            // Categories don't have IDs in CategoryProperties - they're identified by name only
            const minimalCategory = { name: 'New Category' } as CategoryProperties;

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(CategorizeMode.Edit)
                .mockResolvedValueOnce(CategorizeMode.Both);
            mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                EditTransactionAttribute.Category,
            ]);
            mockUserInputService.getNewCategory.mockResolvedValue(minimalCategory);
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            // Execute
            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            // Verify: Categories use name, not ID, so no resolution needed
            expect(result.ok).toBe(true);
            expect(mockAIValidator.getCategoryByName).not.toHaveBeenCalled();
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                expect.anything(),
                'New Category', // ✅ Category name is used directly
                expect.anything()
            );
        });

        it('should handle failed budget resolution gracefully', async () => {
            const minimalBudget = {
                id: '',
                attributes: { name: 'Nonexistent Budget' },
            } as BudgetRead;

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(CategorizeMode.Edit)
                .mockResolvedValueOnce(CategorizeMode.Budget);
            mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                EditTransactionAttribute.Budget,
            ]);
            mockUserInputService.getNewBudget.mockResolvedValue(minimalBudget);
            mockAIValidator.getBudgetByName.mockReturnValue(undefined); // Lookup fails
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            // Execute
            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            // Verify: Falls back to minimal object (empty ID)
            expect(result.ok).toBe(true);
            expect(mockAIValidator.getBudgetByName).toHaveBeenCalledWith('Nonexistent Budget');
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                expect.anything(),
                undefined,
                '' // Falls back to empty string
            );
        });

        it('should not re-resolve budgets that already have valid IDs', async () => {
            const validBudget = { id: '5', attributes: { name: 'Valid Budget' } } as BudgetRead;

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(CategorizeMode.Budget);
            mockAIValidator.validateAIResults.mockResolvedValue({
                ok: true,
                value: { category: undefined, budget: validBudget },
            });
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            // Execute
            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            // Verify: getBudgetByName should NOT be called (budget already has ID)
            expect(result.ok).toBe(true);
            expect(mockAIValidator.getBudgetByName).not.toHaveBeenCalled();
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                expect.anything(),
                undefined,
                '5' // Uses existing valid ID
            );
        });
    });
});
