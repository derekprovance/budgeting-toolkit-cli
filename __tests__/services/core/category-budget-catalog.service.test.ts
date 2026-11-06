import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { CategoryBudgetCatalog } from '../../../src/services/core/category-budget-catalog.service.js';
import { ICategoryService } from '../../../src/services/core/category.service.interface.js';
import { IBudgetService } from '../../../src/services/core/budget.service.interface.js';
import { CategoryProperties, BudgetRead } from '@derekprovance/firefly-iii-sdk';
import { createMockTransaction } from '../../shared/test-data.js';
import { partialMock } from '../../shared/mocks.js';

const budget = (id: string, name: string): BudgetRead =>
    ({ id, type: 'budgets', attributes: { name, active: true } }) as BudgetRead;

describe('CategoryBudgetCatalog', () => {
    const categories: CategoryProperties[] = [
        { name: 'Groceries' },
        { name: 'Healthcare' },
        { name: 'Bills & Utilities' },
        { name: "Children's Expenses" },
    ];
    const budgets = [budget('1', 'Food'), budget('2', 'Medical'), budget('3', 'Utilities')];
    const transaction = createMockTransaction({
        transaction_journal_id: '1',
        description: 'Test Transaction',
    });

    let getCategories: jest.Mock<ICategoryService['getCategories']>;
    let getBudgets: jest.Mock<IBudgetService['getBudgets']>;
    let catalog: CategoryBudgetCatalog;

    beforeEach(async () => {
        getCategories = jest.fn<ICategoryService['getCategories']>(async () => categories);
        getBudgets = jest.fn<IBudgetService['getBudgets']>(async () => budgets);
        catalog = await CategoryBudgetCatalog.load(
            partialMock<ICategoryService>({ getCategories }),
            partialMock<IBudgetService>({ getBudgets })
        );
    });

    it('fetches the categories and budgets once', () => {
        catalog.categoryNames();
        catalog.findBudget('Food');

        expect(getCategories).toHaveBeenCalledTimes(1);
        expect(getBudgets).toHaveBeenCalledTimes(1);
    });

    describe('names', () => {
        it('lists category names sorted, as Firefly spells them', () => {
            expect(catalog.categoryNames()).toEqual([
                'Bills & Utilities',
                "Children's Expenses",
                'Groceries',
                'Healthcare',
            ]);
        });

        it('lists budget names sorted', () => {
            expect(catalog.budgetNames()).toEqual(['Food', 'Medical', 'Utilities']);
        });

        it('leaves out a category without a name', async () => {
            getCategories.mockResolvedValue([{ name: 'Groceries' }, {} as CategoryProperties]);
            const loaded = await CategoryBudgetCatalog.load(
                partialMock<ICategoryService>({ getCategories }),
                partialMock<IBudgetService>({ getBudgets })
            );

            expect(loaded.categoryNames()).toEqual(['Groceries']);
        });
    });

    describe('find', () => {
        it.each(['Groceries', 'groceries', 'GROCERIES', ' Groceries ', '  gRoCeRiEs  '])(
            'finds a category by %p, ignoring case and surrounding spaces',
            name => {
                expect(catalog.findCategory(name)?.name).toBe('Groceries');
            }
        );

        it.each(['Food', 'food', ' FOOD '])('finds a budget by %p', name => {
            expect(catalog.findBudget(name)?.id).toBe('1');
        });

        it('matches names with special characters', () => {
            expect(catalog.findCategory('bills & utilities')?.name).toBe('Bills & Utilities');
            expect(catalog.findCategory("CHILDREN'S EXPENSES")?.name).toBe("Children's Expenses");
        });

        it('returns undefined for an unknown, null or missing name', () => {
            expect(catalog.findCategory('Nope')).toBeUndefined();
            expect(catalog.findBudget(null)).toBeUndefined();
            expect(catalog.findBudget(undefined)).toBeUndefined();
        });
    });

    describe('resolve', () => {
        it('resolves both names, case-insensitively', () => {
            const result = catalog.resolve(transaction, { category: 'groceries', budget: 'FOOD' });

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.category?.name).toBe('Groceries');
                expect(result.value.budget?.attributes.name).toBe('Food');
            }
        });

        it('leaves an absent or empty name unresolved', () => {
            expect(catalog.resolve(transaction, { category: '', budget: undefined })).toEqual({
                ok: true,
                value: { category: undefined, budget: undefined },
            });
        });

        it.each([
            ['category', { category: 'InvalidCategory' }, 'InvalidCategory'],
            ['budget', { budget: 'InvalidBudget' }, 'InvalidBudget'],
        ] as const)('errs on an unknown %s', (field, suggestion, name) => {
            const result = catalog.resolve(transaction, suggestion);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe(field);
                expect(result.error.transactionId).toBe('1');
                expect(result.error.userMessage).toContain(name);
                expect(result.error.userMessage).toContain("doesn't exist");
            }
        });
    });
});
