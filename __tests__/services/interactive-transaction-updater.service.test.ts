import {
    InteractiveTransactionUpdater,
    PreparedUpdate,
} from '../../src/services/interactive-transaction-updater.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { TransactionValidatorService } from '../../src/services/core/transaction-validator.service.js';
import { TransactionAIResultValidator } from '../../src/services/core/transaction-ai-result-validator.service.js';
import { UserInputService } from '../../src/services/user-input.service.js';
import { AIResult } from '../../src/services/ai/llm-transaction-processing.service.js';
import {
    TransactionSplit,
    CategoryProperties,
    BudgetRead,
    TransactionRead,
} from '@derekprovance/firefly-iii-sdk';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ReviewAction, EditTransactionAttribute } from '../../src/types/enums.js';
import { Result, TransactionValidationError } from '../../src/types/result.type.js';
import { withdrawal } from '../shared/test-data.js';

const category = (name: string): CategoryProperties => ({ name });
// Partial API fixture: only the fields the updater reads
const budget = (id: string, name: string): BudgetRead =>
    ({ id, type: 'budget', attributes: { name } }) as unknown as BudgetRead;

const categories = [category('New Category'), category('Groceries')];
const budgets = [budget('2', 'New Budget'), budget('3', 'Food')];

const suggestion: AIResult = { category: 'New Category', budget: 'New Budget' };

describe('InteractiveTransactionUpdater', () => {
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockValidator: jest.Mocked<TransactionValidatorService>;
    let mockAIValidator: jest.Mocked<TransactionAIResultValidator>;
    let mockUserInputService: jest.Mocked<UserInputService>;
    let transaction: TransactionSplit;
    let transactionRead: TransactionRead;

    const build = (dryRun = false) =>
        new InteractiveTransactionUpdater(
            mockTransactionService,
            mockValidator,
            mockAIValidator,
            mockUserInputService,
            dryRun
        );

    const prepare = (ai: AIResult = suggestion, updater = build()) =>
        updater.prepareUpdate(transaction, { '1': ai });

    const prepared = async (ai: AIResult = suggestion, updater = build()) => {
        const result = await prepare(ai, updater);
        if (!result.ok || !result.value) {
            throw new Error('expected a prepared update');
        }
        return result.value;
    };

    const review = async (ai: AIResult = suggestion, updater = build()) =>
        updater.applyUpdate(await prepared(ai, updater), { index: 3, total: 26 });

    beforeEach(() => {
        transaction = withdrawal('100.00', {
            transaction_journal_id: '1',
            description: 'Test Transaction',
            category_name: 'Old Category',
            budget_id: '1',
            budget_name: 'Old Budget',
        });
        transactionRead = { id: '42', type: 'transactions' } as TransactionRead;

        mockTransactionService = {
            updateTransaction: jest
                .fn<TransactionService['updateTransaction']>()
                .mockResolvedValue(transactionRead),
            getTransactionReadBySplit: jest
                .fn<TransactionService['getTransactionReadBySplit']>()
                .mockReturnValue(transactionRead),
        } as unknown as jest.Mocked<TransactionService>;

        mockValidator = {
            validateTransactionData: jest.fn().mockReturnValue(true),
            categoryOrBudgetChanged: jest.fn().mockReturnValue(true),
        } as unknown as jest.Mocked<TransactionValidatorService>;

        mockUserInputService = {
            askToUpdateTransaction: jest
                .fn<UserInputService['askToUpdateTransaction']>()
                .mockResolvedValue(ReviewAction.UpdateAll),
            shouldEditCategoryBudget: jest.fn<UserInputService['shouldEditCategoryBudget']>(),
            getNewCategory: jest.fn<UserInputService['getNewCategory']>(),
            getNewBudget: jest.fn<UserInputService['getNewBudget']>(),
            printSeparator: jest.fn(),
        } as unknown as jest.Mocked<UserInputService>;

        mockAIValidator = {
            validateAIResults: jest.fn(
                async (_tx: TransactionSplit, categoryName?: string, budgetName?: string) =>
                    Result.ok({
                        category: categories.find(c => c.name === categoryName),
                        budget: budgets.find(b => b.attributes.name === budgetName),
                    })
            ),
            getBudgetByName: jest.fn((name: string) =>
                budgets.find(b => b.attributes.name === name)
            ),
            getAvailableCategoryNames: jest.fn(() => categories.map(c => c.name)),
            getAvailableBudgetNames: jest.fn(() => budgets.map(b => b.attributes.name)),
        } as unknown as jest.Mocked<TransactionAIResultValidator>;
    });

    describe('prepareUpdate', () => {
        it('resolves the suggestion into a prepared update', async () => {
            const result = await prepare({ ...suggestion, source: { category: 'history' } });

            expect(result).toEqual(
                Result.ok<PreparedUpdate>({
                    transaction,
                    journalId: '1',
                    category: categories[0],
                    budget: budgets[0],
                    source: { category: 'history' },
                })
            );
        });

        it('returns the validation error for a suggestion that does not resolve', async () => {
            const error: TransactionValidationError = {
                field: 'category',
                message: 'Invalid category',
                userMessage: 'The suggested category "Nope" does not exist',
                transactionId: '1',
                transactionDescription: 'Test Transaction',
            };
            mockAIValidator.validateAIResults.mockResolvedValueOnce(Result.err(error));

            expect(await prepare({ category: 'Nope' })).toEqual(Result.err(error));
        });

        it('resolves to undefined when the suggestion changes nothing', async () => {
            mockValidator.categoryOrBudgetChanged.mockReturnValue(false);

            expect(await prepare()).toEqual(Result.ok(undefined));
        });

        it('turns a thrown error into a validation error', async () => {
            mockAIValidator.validateAIResults.mockRejectedValueOnce(new Error('boom'));

            const result = await prepare();

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.userMessage).toBe('Failed to update transaction: boom');
            }
        });
    });

    describe('applyUpdate', () => {
        it('applies the category and budget the user accepts', async () => {
            const result = await review();

            expect(result).toEqual(Result.ok(transactionRead));
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
                    category: 'New Category',
                    budget: 'New Budget',
                    source: { category: 'history', budget: 'ai' },
                    progress: { index: 3, total: 26 },
                }
            );
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

                expect(result).toEqual(Result.ok(transactionRead));
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
                mockUserInputService.getNewCategory.mockResolvedValue(category('Groceries'));
                mockUserInputService.getNewBudget.mockResolvedValue(budget('', 'Food'));

                await review();

                expect(mockUserInputService.getNewCategory).toHaveBeenCalledWith(
                    ['New Category', 'Groceries'],
                    'New Category',
                    'New Category'
                );
                expect(mockUserInputService.getNewBudget).toHaveBeenCalledWith(
                    ['New Budget', 'Food'],
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
                mockUserInputService.getNewBudget.mockResolvedValue(budget('', 'Food'));

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
                mockUserInputService.getNewCategory.mockResolvedValue(category('Groceries'));

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
                mockUserInputService.getNewCategory.mockResolvedValue(category('Groceries'));

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
                    .mockResolvedValueOnce(category('Groceries'))
                    .mockResolvedValueOnce(category('New Category'));

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
