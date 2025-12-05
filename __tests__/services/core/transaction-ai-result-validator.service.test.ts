import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TransactionAIResultValidator } from '../../../src/services/core/transaction-ai-result-validator.service.js';
import { CategoryService } from '../../../src/services/core/category.service.js';
import { BudgetService } from '../../../src/services/core/budget.service.js';
import { TransactionValidatorService } from '../../../src/services/core/transaction-validator.service.js';
import { CategoryProperties, BudgetRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { createMockTransaction } from '../../shared/test-data.js';

describe('TransactionAIResultValidator', () => {
    let validator: TransactionAIResultValidator;
    let mockCategoryService: jest.Mocked<CategoryService>;
    let mockBudgetService: jest.Mocked<BudgetService>;
    let mockTransactionValidator: jest.Mocked<TransactionValidatorService>;

    const mockCategories: CategoryProperties[] = [
        { id: '1', name: 'Groceries', type: 'expense' },
        { id: '2', name: 'Healthcare', type: 'expense' },
        { id: '3', name: 'Bills & Utilities', type: 'expense' },
        { id: '4', name: "Children's Expenses", type: 'expense' },
    ];

    const mockBudgets: BudgetRead[] = [
        {
            id: '1',
            type: 'budgets',
            attributes: { name: 'Food', active: true, order: 1 },
        } as BudgetRead,
        {
            id: '2',
            type: 'budgets',
            attributes: { name: 'Medical', active: true, order: 2 },
        } as BudgetRead,
        {
            id: '3',
            type: 'budgets',
            attributes: { name: 'Utilities', active: true, order: 3 },
        } as BudgetRead,
    ];

    beforeEach(() => {
        mockCategoryService = {
            getCategories: jest
                .fn<() => Promise<CategoryProperties[]>>()
                .mockResolvedValue(mockCategories),
        } as unknown as jest.Mocked<CategoryService>;

        mockBudgetService = {
            getBudgets: jest.fn<() => Promise<BudgetRead[]>>().mockResolvedValue(mockBudgets),
        } as unknown as jest.Mocked<BudgetService>;

        mockTransactionValidator = {
            canUpdateBudget: jest
                .fn<(transaction: TransactionSplit) => boolean>()
                .mockReturnValue(true),
            shouldSetBudget: jest
                .fn<(transaction: TransactionSplit) => Promise<boolean>>()
                .mockResolvedValue(true),
        } as unknown as jest.Mocked<TransactionValidatorService>;

        validator = new TransactionAIResultValidator(
            mockCategoryService,
            mockBudgetService,
            mockTransactionValidator
        );
    });

    describe('initialize', () => {
        it('should load categories and budgets into lookup maps', async () => {
            await validator.initialize();

            expect(mockCategoryService.getCategories).toHaveBeenCalled();
            expect(mockBudgetService.getBudgets).toHaveBeenCalled();
        });

        it('should create case-insensitive category lookups', async () => {
            await validator.initialize();

            expect(validator.getCategoryByName('Groceries')).toBeDefined();
            expect(validator.getCategoryByName('groceries')).toBeDefined();
            expect(validator.getCategoryByName('GROCERIES')).toBeDefined();
            expect(validator.getCategoryByName(' Groceries ')).toBeDefined();
        });

        it('should create case-insensitive budget lookups', async () => {
            await validator.initialize();

            expect(validator.getBudgetByName('Food')).toBeDefined();
            expect(validator.getBudgetByName('food')).toBeDefined();
            expect(validator.getBudgetByName('FOOD')).toBeDefined();
            expect(validator.getBudgetByName(' Food ')).toBeDefined();
        });

        it('should handle categories with special characters', async () => {
            await validator.initialize();

            const result1 = validator.getCategoryByName('Bills & Utilities');
            const result2 = validator.getCategoryByName('bills & utilities');
            const result3 = validator.getCategoryByName('BILLS & UTILITIES');

            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
            expect(result3).toBeDefined();
            expect(result1?.name).toBe('Bills & Utilities');
            expect(result2?.name).toBe('Bills & Utilities');
            expect(result3?.name).toBe('Bills & Utilities');
        });

        it('should handle categories with apostrophes', async () => {
            await validator.initialize();

            const result1 = validator.getCategoryByName("Children's Expenses");
            const result2 = validator.getCategoryByName("children's expenses");
            const result3 = validator.getCategoryByName("CHILDREN'S EXPENSES");

            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
            expect(result3).toBeDefined();
            expect(result1?.name).toBe("Children's Expenses");
        });
    });

    describe('getCategoryByName', () => {
        beforeEach(async () => {
            await validator.initialize();
        });

        it('should return category for exact match', () => {
            const category = validator.getCategoryByName('Groceries');
            expect(category).toBeDefined();
            expect(category?.name).toBe('Groceries');
        });

        it('should return category for lowercase match', () => {
            const category = validator.getCategoryByName('groceries');
            expect(category).toBeDefined();
            expect(category?.name).toBe('Groceries');
        });

        it('should return category for uppercase match', () => {
            const category = validator.getCategoryByName('GROCERIES');
            expect(category).toBeDefined();
            expect(category?.name).toBe('Groceries');
        });

        it('should return category for match with leading/trailing spaces', () => {
            const category = validator.getCategoryByName('  Groceries  ');
            expect(category).toBeDefined();
            expect(category?.name).toBe('Groceries');
        });

        it('should return category for mixed case with spaces', () => {
            const category = validator.getCategoryByName(' gRoCeRiEs ');
            expect(category).toBeDefined();
            expect(category?.name).toBe('Groceries');
        });

        it('should return undefined for non-existent category', () => {
            const category = validator.getCategoryByName('NonExistent');
            expect(category).toBeUndefined();
        });
    });

    describe('getBudgetByName', () => {
        beforeEach(async () => {
            await validator.initialize();
        });

        it('should return budget for exact match', () => {
            const budget = validator.getBudgetByName('Food');
            expect(budget).toBeDefined();
            expect(budget?.attributes.name).toBe('Food');
        });

        it('should return budget for lowercase match', () => {
            const budget = validator.getBudgetByName('food');
            expect(budget).toBeDefined();
            expect(budget?.attributes.name).toBe('Food');
        });

        it('should return budget for uppercase match', () => {
            const budget = validator.getBudgetByName('FOOD');
            expect(budget).toBeDefined();
            expect(budget?.attributes.name).toBe('Food');
        });

        it('should return budget for match with leading/trailing spaces', () => {
            const budget = validator.getBudgetByName('  Food  ');
            expect(budget).toBeDefined();
            expect(budget?.attributes.name).toBe('Food');
        });

        it('should return undefined for non-existent budget', () => {
            const budget = validator.getBudgetByName('NonExistent');
            expect(budget).toBeUndefined();
        });
    });

    describe('getAvailableCategoryNames', () => {
        beforeEach(async () => {
            await validator.initialize();
        });

        it('should return actual category names (not normalized)', () => {
            const names = validator.getAvailableCategoryNames();
            expect(names).toContain('Groceries');
            expect(names).toContain('Healthcare');
            expect(names).toContain('Bills & Utilities');
            expect(names).not.toContain('groceries'); // Should not be normalized
        });

        it('should return correct number of categories', () => {
            const names = validator.getAvailableCategoryNames();
            expect(names).toHaveLength(mockCategories.length);
        });
    });

    describe('getAvailableBudgetNames', () => {
        beforeEach(async () => {
            await validator.initialize();
        });

        it('should return actual budget names (not normalized)', () => {
            const names = validator.getAvailableBudgetNames();
            expect(names).toContain('Food');
            expect(names).toContain('Medical');
            expect(names).toContain('Utilities');
            expect(names).not.toContain('food'); // Should not be normalized
        });

        it('should return correct number of budgets', () => {
            const names = validator.getAvailableBudgetNames();
            expect(names).toHaveLength(mockBudgets.length);
        });
    });

    describe('validateAIResults', () => {
        const transaction: TransactionSplit = createMockTransaction({
            transaction_journal_id: '1',
            description: 'Test Transaction',
            amount: '100.00',
            type: 'withdrawal',
        });

        beforeEach(async () => {
            await validator.initialize();
        });

        it('should validate matching category with exact case', async () => {
            const result = await validator.validateAIResults(transaction, 'Groceries', undefined);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.category).toBeDefined();
                expect(result.value.category?.name).toBe('Groceries');
            }
        });

        it('should validate matching category with different case', async () => {
            const result = await validator.validateAIResults(transaction, 'groceries', undefined);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.category).toBeDefined();
                expect(result.value.category?.name).toBe('Groceries');
            }
        });

        it('should validate matching category with uppercase', async () => {
            const result = await validator.validateAIResults(transaction, 'GROCERIES', undefined);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.category).toBeDefined();
                expect(result.value.category?.name).toBe('Groceries');
            }
        });

        it('should validate matching category with leading/trailing spaces', async () => {
            const result = await validator.validateAIResults(transaction, ' Groceries ', undefined);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.category).toBeDefined();
                expect(result.value.category?.name).toBe('Groceries');
            }
        });

        it('should validate matching budget with different case', async () => {
            const result = await validator.validateAIResults(transaction, undefined, 'food');

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.budget).toBeDefined();
                expect(result.value.budget?.attributes.name).toBe('Food');
            }
        });

        it('should validate both category and budget with case variations', async () => {
            const result = await validator.validateAIResults(transaction, 'groceries', 'FOOD');

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.category?.name).toBe('Groceries');
                expect(result.value.budget?.attributes.name).toBe('Food');
            }
        });

        it('should return error for invalid category', async () => {
            const result = await validator.validateAIResults(
                transaction,
                'InvalidCategory',
                undefined
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.userMessage).toContain('InvalidCategory');
                expect(result.error.userMessage).toContain("doesn't exist");
            }
        });

        it('should return error for invalid budget', async () => {
            const result = await validator.validateAIResults(
                transaction,
                undefined,
                'InvalidBudget'
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.userMessage).toContain('InvalidBudget');
                expect(result.error.userMessage).toContain("doesn't exist");
            }
        });

        it('should handle empty category string as valid (no category)', async () => {
            const result = await validator.validateAIResults(transaction, '', undefined);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.category).toBeUndefined();
            }
        });

        it('should handle empty budget string as valid (no budget)', async () => {
            const result = await validator.validateAIResults(transaction, undefined, '');

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.budget).toBeUndefined();
            }
        });

        it('should not validate budget for transactions that cannot have budgets', async () => {
            mockTransactionValidator.shouldSetBudget.mockResolvedValue(false);

            const result = await validator.validateAIResults(transaction, undefined, 'Food');

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.budget).toBeUndefined();
            }
        });

        it('should validate categories with special characters', async () => {
            const result = await validator.validateAIResults(
                transaction,
                'bills & utilities',
                undefined
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.category?.name).toBe('Bills & Utilities');
            }
        });

        it('should validate categories with apostrophes', async () => {
            const result = await validator.validateAIResults(
                transaction,
                "CHILDREN'S EXPENSES",
                undefined
            );

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.category?.name).toBe("Children's Expenses");
            }
        });
    });
});
