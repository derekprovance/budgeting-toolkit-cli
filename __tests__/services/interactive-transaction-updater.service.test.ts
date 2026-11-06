import {
    InteractiveTransactionUpdater,
    PreparedUpdate,
} from '../../src/services/interactive-transaction-updater.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { TransactionValidatorService } from '../../src/services/core/transaction-validator.service.js';
import { CategoryBudgetCatalog } from '../../src/services/core/category-budget-catalog.service.js';
import { ReviewCancelledError, UserInputService } from '../../src/services/user-input.service.js';
import { TransactionRead } from '@derekprovance/firefly-iii-sdk';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ReviewAction, EditTransactionAttribute } from '../../src/types/enums.js';
import { Result } from '../../src/types/result.type.js';
import { budgetRead, transactionRead, withdrawal } from '../shared/test-data.js';
import { JournaledTransaction, Suggestion } from '../../src/types/categorize.types.js';
import { loadCatalog, partialMock } from '../shared/mocks.js';

const budgets = [budgetRead('2', 'New Budget'), budgetRead('3', 'Food')];

/** A suggestion without its transaction, which each test fills in */
type Names = Partial<Omit<Suggestion, 'transaction'>>;

const suggestion: Names = { category: 'New Category', budget: 'New Budget' };

describe('InteractiveTransactionUpdater', () => {
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockValidator: jest.Mocked<TransactionValidatorService>;
    let catalog: CategoryBudgetCatalog;
    let mockUserInputService: jest.Mocked<UserInputService>;
    let transaction: JournaledTransaction;
    let group: TransactionRead;

    const build = (dryRun = false) =>
        new InteractiveTransactionUpdater(
            mockTransactionService,
            mockValidator,
            catalog,
            mockUserInputService,
            { force: false, dryRun }
        );

    const prepare = (names: Names = suggestion, updater = build()) =>
        updater.prepareUpdate({ transaction, source: {}, ...names });

    const prepared = (names: Names = suggestion, updater = build()) => {
        const result = prepare(names, updater);
        if (!result.ok || !result.value) {
            throw new Error('expected a prepared update');
        }
        return result.value;
    };

    const review = (names: Names = suggestion, updater = build()) =>
        updater.applyUpdate(prepared(names, updater), { index: 3, total: 26 });

    beforeEach(async () => {
        transaction = {
            ...withdrawal('100.00', {
                description: 'Test Transaction',
                category_name: 'Old Category',
                budget_id: '1',
                budget_name: 'Old Budget',
            }),
            transaction_journal_id: '1',
        };
        group = transactionRead('42');

        mockTransactionService = partialMock<TransactionService>({
            updateTransaction: jest
                .fn<TransactionService['updateTransaction']>()
                .mockResolvedValue(group),
            getTransactionReadBySplit: jest
                .fn<TransactionService['getTransactionReadBySplit']>()
                .mockReturnValue(group),
        });

        mockValidator = partialMock<TransactionValidatorService>({
            categoryOrBudgetChanged: jest
                .fn<TransactionValidatorService['categoryOrBudgetChanged']>()
                .mockReturnValue(true),
            shouldSetBudget: jest
                .fn<TransactionValidatorService['shouldSetBudget']>()
                .mockReturnValue(true),
        });

        mockUserInputService = partialMock<UserInputService>({
            askToUpdateTransaction: jest
                .fn<UserInputService['askToUpdateTransaction']>()
                .mockResolvedValue(ReviewAction.UpdateAll),
            shouldEditCategoryBudget: jest.fn<UserInputService['shouldEditCategoryBudget']>(),
            getNewCategory: jest.fn<UserInputService['getNewCategory']>(),
            getNewBudget: jest.fn<UserInputService['getNewBudget']>(),
            printSeparator: jest.fn(),
        });

        catalog = await loadCatalog(['New Category', 'Groceries'], budgets);
    });

    describe('prepareUpdate', () => {
        it('resolves the suggestion into a prepared update', async () => {
            const result = prepare({ ...suggestion, source: { category: 'history' } });

            expect(result).toEqual(
                Result.ok<PreparedUpdate>({
                    transaction,
                    category: { name: 'New Category' },
                    budget: budgets[0],
                    source: { category: 'history' },
                })
            );
        });

        it('returns the validation error for a suggestion that does not resolve', async () => {
            const result = prepare({ category: 'Nope' });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe('category');
                expect(result.error.transactionId).toBe('1');
            }
        });

        it('resolves to undefined when the suggestion changes nothing', async () => {
            mockValidator.categoryOrBudgetChanged.mockReturnValue(false);

            expect(prepare()).toEqual(Result.ok(undefined));
        });
    });

    describe('applyUpdate', () => {
        it('applies the category and budget the user accepts', async () => {
            const result = await review();

            expect(result).toEqual(Result.ok(group));
            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                transaction,
                'New Category',
                '2'
            );
        });

        it('shows the suggestion, its sources and its position in the prompt', async () => {
            await review({ ...suggestion, source: { category: 'history', budget: 'ai' } });

            expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledWith(
                transaction,
                '42',
                {
                    canSetBudget: true,
                    category: 'New Category',
                    budget: 'New Budget',
                    source: { category: 'history', budget: 'ai' },
                    progress: { index: 3, total: 26 },
                }
            );
        });

        it('offers no budget choice where the validator refuses one (bill-linked)', async () => {
            mockValidator.shouldSetBudget.mockReturnValue(false);
            mockUserInputService.askToUpdateTransaction
                .mockResolvedValueOnce(ReviewAction.Edit)
                .mockResolvedValueOnce(ReviewAction.Skip);
            mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([]);

            await review({ category: 'New Category' });

            expect(mockValidator.shouldSetBudget).toHaveBeenCalledWith(transaction);
            expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledWith(
                transaction,
                '42',
                expect.objectContaining({ canSetBudget: false })
            );
            expect(mockUserInputService.shouldEditCategoryBudget).toHaveBeenCalledWith(false);
        });

        it('applies only the category when the user chooses it', async () => {
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                ReviewAction.UpdateCategory
            );

            await review();

            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                transaction,
                'New Category',
                undefined
            );
        });

        it('applies only the budget when the user chooses it', async () => {
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(
                ReviewAction.UpdateBudget
            );

            await review();

            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                transaction,
                undefined,
                '2'
            );
        });

        it('applies a budget-only suggestion', async () => {
            await review({ budget: 'New Budget' });

            expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                transaction,
                undefined,
                '2'
            );
        });

        it('changes nothing when the user skips', async () => {
            mockUserInputService.askToUpdateTransaction.mockResolvedValue(ReviewAction.Skip);

            expect(await review()).toEqual(Result.ok(undefined));
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('returns an error when the transaction details cannot be found', async () => {
            mockTransactionService.getTransactionReadBySplit.mockReturnValue(undefined);

            const result = await review();

            expect(result.ok).toBe(false);
            expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
        });

        it('lets a cancelled review propagate', async () => {
            const cancelled = new ReviewCancelledError();
            mockUserInputService.askToUpdateTransaction.mockRejectedValue(cancelled);

            await expect(review()).rejects.toBe(cancelled);
        });

        it('returns an error when Firefly rejects the update', async () => {
            mockTransactionService.updateTransaction.mockRejectedValue(new Error('API Error'));

            const result = await review();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toBe('API Error');
            }
        });

        describe('dry run', () => {
            it('returns the transaction without prompting or updating', async () => {
                const result = await review(suggestion, build(true));

                expect(result).toEqual(Result.ok(group));
                expect(mockUserInputService.askToUpdateTransaction).not.toHaveBeenCalled();
                expect(mockTransactionService.updateTransaction).not.toHaveBeenCalled();
            });
        });

        describe('edit', () => {
            beforeEach(() => {
                mockUserInputService.askToUpdateTransaction
                    .mockResolvedValueOnce(ReviewAction.Edit)
                    .mockResolvedValueOnce(ReviewAction.UpdateAll);
            });

            it('applies the edited category and budget', async () => {
                mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                    EditTransactionAttribute.Category,
                    EditTransactionAttribute.Budget,
                ]);
                mockUserInputService.getNewCategory.mockResolvedValue('Groceries');
                mockUserInputService.getNewBudget.mockResolvedValue('Food');

                await review();

                expect(mockUserInputService.getNewCategory).toHaveBeenCalledWith(
                    ['Groceries', 'New Category'],
                    'New Category',
                    'New Category'
                );
                expect(mockUserInputService.getNewBudget).toHaveBeenCalledWith(
                    ['Food', 'New Budget'],
                    'New Budget',
                    'New Budget'
                );
                expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                    transaction,
                    'Groceries',
                    '3'
                );
            });

            it('keeps the field that was not edited', async () => {
                mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                    EditTransactionAttribute.Budget,
                ]);
                mockUserInputService.getNewBudget.mockResolvedValue('Food');

                await review();

                expect(mockUserInputService.getNewCategory).not.toHaveBeenCalled();
                expect(mockTransactionService.updateTransaction).toHaveBeenCalledWith(
                    transaction,
                    'New Category',
                    '3'
                );
            });

            it('drops the source label of an edited field', async () => {
                mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                    EditTransactionAttribute.Category,
                ]);
                mockUserInputService.getNewCategory.mockResolvedValue('Groceries');

                await review({ ...suggestion, source: { category: 'ai', budget: 'history' } });

                expect(mockUserInputService.askToUpdateTransaction).toHaveBeenLastCalledWith(
                    transaction,
                    '42',
                    expect.objectContaining({
                        category: 'Groceries',
                        source: { budget: 'history' },
                    })
                );
            });

            it('re-prompts at the same position without a new separator', async () => {
                mockUserInputService.askToUpdateTransaction
                    .mockReset()
                    .mockResolvedValueOnce(ReviewAction.Edit)
                    .mockResolvedValueOnce(ReviewAction.Edit)
                    .mockResolvedValueOnce(ReviewAction.UpdateAll);
                mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                    EditTransactionAttribute.Category,
                ]);
                mockUserInputService.getNewCategory.mockResolvedValue('Groceries');

                await review();

                expect(mockUserInputService.askToUpdateTransaction).toHaveBeenCalledTimes(3);
                for (const call of mockUserInputService.askToUpdateTransaction.mock.calls) {
                    expect(call[2]).toEqual(
                        expect.objectContaining({ progress: { index: 3, total: 26 } })
                    );
                }
                expect(mockUserInputService.printSeparator).toHaveBeenCalledTimes(1);
            });

            it('keeps offering the original suggestion across edits', async () => {
                mockUserInputService.askToUpdateTransaction
                    .mockReset()
                    .mockResolvedValueOnce(ReviewAction.Edit)
                    .mockResolvedValueOnce(ReviewAction.Edit)
                    .mockResolvedValueOnce(ReviewAction.UpdateAll);
                mockUserInputService.shouldEditCategoryBudget.mockResolvedValue([
                    EditTransactionAttribute.Category,
                ]);
                mockUserInputService.getNewCategory
                    .mockResolvedValueOnce('Groceries')
                    .mockResolvedValueOnce('New Category');

                await review();

                expect(mockUserInputService.getNewCategory).toHaveBeenNthCalledWith(
                    2,
                    expect.any(Array),
                    'Groceries',
                    'New Category'
                );
            });
        });
    });
});
