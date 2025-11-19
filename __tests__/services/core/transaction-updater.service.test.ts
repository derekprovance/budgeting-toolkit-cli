import { TransactionUpdaterService } from '../../../src/services/core/transaction-updater.service';
import { TransactionService } from '../../../src/services/core/transaction.service';
import { TransactionValidatorService } from '../../../src/services/core/transaction-validator.service';
import { UserInputService } from '../../../src/services/user-input.service';
import { UpdateTransactionMode } from '../../../src/types/enum/update-transaction-mode.enum';
import { EditTransactionAttribute } from '../../../src/types/enum/edit-transaction-attribute.enum';
import { TransactionSplit, CategoryProperties, BudgetRead } from '@derekprovance/firefly-iii-sdk';

// Mock the logger to prevent console output during tests
jest.mock('../../../src/logger', () => ({
    logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    },
}));

jest.mock('../../../src/services/core/transaction.service');
jest.mock('../../../src/services/core/transaction-validator.service');
jest.mock('../../../src/services/user-input.service');

describe('TransactionUpdaterService', () => {
    let service: TransactionUpdaterService;
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockValidator: jest.Mocked<TransactionValidatorService>;
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
            updateTransaction: jest.fn(),
            getTransactionReadBySplit: jest.fn(),
        } as unknown as jest.Mocked<TransactionService>;

        mockValidator = {
            validateTransactionData: jest.fn(),
            shouldSetBudget: jest.fn(),
            categoryOrBudgetChanged: jest.fn(),
        } as unknown as jest.Mocked<TransactionValidatorService>;

        mockUserInputService = {
            askToUpdateTransaction: jest.fn().mockResolvedValue(UpdateTransactionMode.Both),
            shouldEditCategoryBudget: jest.fn(),
            getNewCategory: jest.fn(),
            getNewBudget: jest.fn(),
        } as unknown as jest.Mocked<UserInputService>;

        service = new TransactionUpdaterService(
            mockTransactionService,
            mockValidator,
            mockUserInputService,
            false,
            mockCategories as CategoryProperties[],
            mockBudgets as BudgetRead[]
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('updateTransaction', () => {
        it('should return undefined when transaction data is invalid', async () => {
            mockValidator.validateTransactionData.mockReturnValue(false);

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result).toBeUndefined();
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
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                UpdateTransactionMode.Both
            );
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result).toBe(mockTransaction);
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                'New Category',
                '2'
            );
        });

        it('should return undefined when transaction has no journal ID', async () => {
            const transactionWithoutId = {
                ...mockTransaction,
                transaction_journal_id: undefined,
            };

            const result = await service.updateTransaction(
                transactionWithoutId as TransactionSplit,
                mockAIResults
            );

            expect(result).toBeUndefined();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should not update budget when shouldSetBudget returns false', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(false);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                UpdateTransactionMode.Both
            );
            mockTransactionService.updateTransaction.mockResolvedValue(undefined);

            await service.updateTransaction(mockTransaction as TransactionSplit, mockAIResults);

            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                'New Category',
                undefined
            );
        });

        it('should return undefined when no changes are detected', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(false);

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result).toBeUndefined();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should return undefined when user rejects the update', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                UpdateTransactionMode.Skip
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result).toBeUndefined();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should skip user confirmation when in dry run mode', async () => {
            const serviceWithDryRun = new TransactionUpdaterService(
                mockTransactionService,
                mockValidator,
                mockUserInputService,
                true,
                mockCategories as CategoryProperties[],
                mockBudgets as BudgetRead[]
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

            expect(result).toBe(mockTransaction);
            expect(mockUserInputService.askToUpdateTransaction).not.toHaveBeenCalled();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should handle errors during update', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockTransactionService.updateTransaction.mockRejectedValue(new Error('Update failed'));

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result).toBeUndefined();
        });

        it('should return transaction without updating when in dry run mode', async () => {
            const serviceWithDryRun = new TransactionUpdaterService(
                mockTransactionService,
                mockValidator,
                mockUserInputService,
                true,
                mockCategories as CategoryProperties[],
                mockBudgets as BudgetRead[]
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

            expect(result).toBe(mockTransaction);
            expect(mockUserInputService.askToUpdateTransaction).not.toHaveBeenCalled();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should skip validation in dry run mode if transaction data is invalid', async () => {
            const serviceWithDryRun = new TransactionUpdaterService(
                mockTransactionService,
                mockValidator,
                mockUserInputService,
                true,
                mockCategories as CategoryProperties[],
                mockBudgets as BudgetRead[]
            );

            mockValidator.validateTransactionData.mockReturnValue(false);

            const result = await serviceWithDryRun.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result).toBeUndefined();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should combine dry run with no confirmation', async () => {
            const serviceWithBoth = new TransactionUpdaterService(
                mockTransactionService,
                mockValidator,
                mockUserInputService,
                true,
                mockCategories as CategoryProperties[],
                mockBudgets as BudgetRead[]
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

            expect(result).toBe(mockTransaction);
            expect(mockUserInputService.askToUpdateTransaction).not.toHaveBeenCalled();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should return undefined when AI provides empty category', async () => {
            const aiResultsWithEmptyCategory = {
                '1': { category: '', budget: 'New Budget' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithEmptyCategory
            );

            expect(result).toBeUndefined();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
            // Budget validation now runs independently, even when category validation fails
            expect(mockValidator.shouldSetBudget).toHaveBeenCalledWith(mockTransaction);
        });

        it('should return undefined when AI provides invalid category', async () => {
            const aiResultsWithInvalidCategory = {
                '1': { category: 'Invalid Category', budget: 'New Budget' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithInvalidCategory
            );

            expect(result).toBeUndefined();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
            // Budget validation now runs independently, even when category validation fails
            expect(mockValidator.shouldSetBudget).toHaveBeenCalledWith(mockTransaction);
        });

        it('should return undefined when AI provides empty budget', async () => {
            const aiResultsWithEmptyBudget = {
                '1': { category: 'New Category', budget: '' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithEmptyBudget
            );

            expect(result).toBeUndefined();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should return undefined when AI provides invalid budget', async () => {
            const aiResultsWithInvalidBudget = {
                '1': { category: 'New Category', budget: 'Invalid Budget' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithInvalidBudget
            );

            expect(result).toBeUndefined();
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('should handle edit mode workflow', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(UpdateTransactionMode.Edit)
                .mockResolvedValueOnce(UpdateTransactionMode.Both);
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

            expect(result).toBe(mockTransaction);
            expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledTimes(2);
            expect(mockUserInputService.shouldEditCategoryBudget).toHaveBeenCalled();
            expect(mockUserInputService.getNewCategory).toHaveBeenCalledWith(mockCategories);
            expect(mockUserInputService.getNewBudget).toHaveBeenCalledWith(mockBudgets);
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
                .mockResolvedValueOnce(UpdateTransactionMode.Edit)
                .mockResolvedValueOnce(UpdateTransactionMode.Category);
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

            expect(result).toBe(mockTransaction);
            expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledTimes(2);
            expect(mockUserInputService.shouldEditCategoryBudget).toHaveBeenCalled();
            expect(mockUserInputService.getNewCategory).toHaveBeenCalledWith(mockCategories);
            expect(mockUserInputService.getNewBudget).not.toHaveBeenCalled();
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                'New Category',
                undefined
            );
        });

        it('should handle edit mode with only budget change', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(UpdateTransactionMode.Edit)
                .mockResolvedValueOnce(UpdateTransactionMode.Budget);
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

            expect(result).toBe(mockTransaction);
            expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledTimes(2);
            expect(mockUserInputService.shouldEditCategoryBudget).toHaveBeenCalled();
            expect(mockUserInputService.getNewCategory).not.toHaveBeenCalled();
            expect(mockUserInputService.getNewBudget).toHaveBeenCalledWith(mockBudgets);
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                undefined,
                '2'
            );
        });

        it('should handle multiple edit cycles', async () => {
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(UpdateTransactionMode.Edit)
                .mockResolvedValueOnce(UpdateTransactionMode.Edit)
                .mockResolvedValueOnce(UpdateTransactionMode.Both);
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

            expect(result).toBe(mockTransaction);
            expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledTimes(3);
            expect(mockUserInputService.shouldEditCategoryBudget).toHaveBeenCalledTimes(2);
            expect(mockUserInputService.getNewCategory).toHaveBeenCalledTimes(2);
        });

        it('should handle undefined category from AI (no category provided)', async () => {
            const aiResultsWithUndefinedCategory = {
                '1': { budget: 'New Budget' }, // No category field
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                UpdateTransactionMode.Budget
            );
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithUndefinedCategory
            );

            // This should now work as a budget-only update
            expect(result).toBe(mockTransaction);
            expect(mockValidator.shouldSetBudget).toHaveBeenCalledWith(mockTransaction);
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
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                UpdateTransactionMode.Budget
            );
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithBadCategory
            );

            // This should work as a budget-only update since category failed but budget succeeded
            expect(result).toBe(mockTransaction);
            // Budget validation runs independently of category validation
            expect(mockValidator.shouldSetBudget).toHaveBeenCalledWith(mockTransaction);
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
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                UpdateTransactionMode.Both
            );
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                mockAIResults
            );

            expect(result).toBe(mockTransaction);
            expect(mockValidator.shouldSetBudget).toHaveBeenCalledWith(mockTransaction);
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
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                UpdateTransactionMode.Category
            );
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithValidCategoryOnly
            );

            expect(result).toBe(mockTransaction);
            expect(mockValidator.shouldSetBudget).toHaveBeenCalledWith(mockTransaction);
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
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                UpdateTransactionMode.Budget
            );
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithValidBudgetOnly
            );

            // Fixed: Budget-only updates now work correctly
            expect(result).toBe(mockTransaction);

            // Budget validation should run since it's independent of category validation
            expect(mockValidator.shouldSetBudget).toHaveBeenCalledWith(mockTransaction);
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

        it('should handle error return types inconsistency - some methods return undefined vs return', async () => {
            const aiResultsWithEmptyCategory = {
                '1': { category: '', budget: 'New Budget' },
            };

            mockValidator.validateTransactionData.mockReturnValue(true);

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithEmptyCategory
            );

            // The refactored code has inconsistent return types:
            // Some early returns use 'return;' (which returns undefined)
            // Others use 'return undefined;'
            // This test documents that behavior
            expect(result).toBeUndefined();
        });

        it('should support budget-only updates (TODO resolved)', async () => {
            // The TODO comment has been resolved - budget-only updates now work

            const aiResultsWithOnlyBudget = {
                '1': { budget: 'New Budget' }, // No category provided
            };

            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.shouldSetBudget.mockResolvedValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                UpdateTransactionMode.Budget
            );
            mockTransactionService.updateTransaction.mockResolvedValue(mockTransaction as any);
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(
                mockTransaction as any
            );

            const result = await service.updateTransaction(
                mockTransaction as TransactionSplit,
                aiResultsWithOnlyBudget
            );

            // Budget-only updates are now supported
            expect(result).toBe(mockTransaction);
            expect(mockValidator.shouldSetBudget).toHaveBeenCalledWith(mockTransaction);
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
    });
});
