import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ReviewAction, EditTransactionAttribute } from '../../src/types/enums.js';

// The subset of an @inquirer/prompts config these tests read back
type PromptConfig = {
    message: string;
    choices?: unknown[];
    validate?: (value: string) => boolean | string;
    [key: string]: unknown;
};
type PromptFn<R> = (config: PromptConfig) => Promise<R>;

// Create mock functions first
const mockExpand = jest.fn<PromptFn<ReviewAction>>();
const mockCheckbox = jest.fn<PromptFn<EditTransactionAttribute[]>>();
const mockSelect = jest.fn<PromptFn<string>>();
const mockSearch = jest.fn<PromptFn<string>>();
const mockInput = jest.fn<PromptFn<string>>();
const mockConfirm = jest.fn<PromptFn<boolean>>();

// chalk is not mocked: FORCE_COLOR=0 (__tests__/setup/env.ts) keeps output plain.

// Mock @inquirer/prompts
jest.unstable_mockModule('@inquirer/prompts', () => ({
    expand: mockExpand,
    checkbox: mockCheckbox,
    select: mockSelect,
    search: mockSearch,
    input: mockInput,
    confirm: mockConfirm,
}));

// Dynamic imports after mocks
const { UserInputService, ReviewCancelledError } =
    await import('../../src/services/user-input.service.js');

describe('UserInputService', () => {
    let service: InstanceType<typeof UserInputService>;

    const mockBaseUrl = 'http://firefly.example.com';

    beforeEach(() => {
        service = new UserInputService(mockBaseUrl);

        // Reset mocks
        mockExpand.mockReset();
        mockCheckbox.mockReset();
        mockSelect.mockReset();
        mockSearch.mockReset();
        mockInput.mockReset();
        mockConfirm.mockReset();
    });

    afterEach(() => {
        // Don't use jest.clearAllMocks() as it clears implementations
        mockExpand.mockReset();
        mockCheckbox.mockReset();
        mockSelect.mockReset();
        mockSearch.mockReset();
        mockInput.mockReset();
        mockConfirm.mockReset();
    });

    describe('printSeparator', () => {
        it('prints a blank line', () => {
            const log = jest.spyOn(console, 'log').mockImplementation(() => {});
            try {
                service.printSeparator();
                expect(log).toHaveBeenCalledTimes(1);
                expect(log.mock.calls[0]).toEqual([]);
            } finally {
                log.mockRestore();
            }
        });
    });

    describe('askToUpdateTransaction', () => {
        const mockTransaction: Partial<TransactionSplit> = {
            description: 'Test Transaction',
            category_name: 'Old Category',
            budget_name: 'Old Budget',
            amount: '34.99',
            type: 'withdrawal',
            currency_symbol: '$',
        };

        const mockTransactionId = '5';

        it('should always show both fields even when values match current', async () => {
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                {
                    canSetBudget: true,
                    category: mockTransaction.category_name ?? undefined,
                    budget: mockTransaction.budget_name ?? undefined,
                }
            );

            expect(result).toBe(ReviewAction.Skip);
            // Should still prompt user since both fields are always displayed
            expect(mockExpand).toHaveBeenCalled();
        });

        it('labels each suggestion with where it came from', async () => {
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                {
                    canSetBudget: true,
                    category: 'Groceries',
                    budget: 'Food',
                    source: { category: 'history', budget: 'ai' },
                }
            );

            const message = (mockExpand.mock.calls[0][0] as { message: string }).message;
            expect(message).toMatch(/Category.*Groceries \(history\)/);
            expect(message).toMatch(/Budget.*Food \(AI\)/);
        });

        it('marks a suggestion equal to the current value as unchanged', async () => {
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                {
                    canSetBudget: true,
                    category: 'Groceries',
                    budget: 'Old Budget',
                    source: { category: 'history', budget: 'history' },
                }
            );

            const message = (mockExpand.mock.calls[0][0] as { message: string }).message;
            expect(message).toMatch(/Budget: Old Budget \(unchanged\)/);
            expect(message).not.toMatch(/Budget:.*→/);
            expect(message).toMatch(/Category: Old Category → Groceries \(history\)/);
        });

        it('starts the prompt on the transaction line with its position', async () => {
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { canSetBudget: true, category: 'Groceries', progress: { index: 3, total: 26 } }
            );

            const message = (mockExpand.mock.calls[0][0] as { message: string }).message;
            // A leading newline would leave the prompt prefix alone on a line
            expect(message.startsWith('[3/26] Transaction:')).toBe(true);
        });

        it('shows no position when progress is not given', async () => {
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { canSetBudget: true, category: 'Groceries' }
            );

            const message = (mockExpand.mock.calls[0][0] as { message: string }).message;
            expect(message.startsWith('Transaction:')).toBe(true);
        });

        it('shows no label when the source is unknown', async () => {
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { canSetBudget: true, category: 'Groceries' }
            );

            const message = (mockExpand.mock.calls[0][0] as { message: string }).message;
            expect(message).not.toMatch(/\((history|AI)\)/);
        });

        it('should prompt for category change only', async () => {
            const newCategory = 'New Category';
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateCategory);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { canSetBudget: true, category: newCategory }
            );

            expect(result).toBe(ReviewAction.UpdateCategory);
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Apply these changes?'),
                    default: 'a',
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: 'a',
                            name: 'Update all',
                            value: ReviewAction.UpdateAll,
                        }),
                        expect.objectContaining({
                            key: 'c',
                            name: 'Update only the category',
                            value: ReviewAction.UpdateCategory,
                        }),
                        expect.objectContaining({
                            key: 's',
                            name: 'Skip',
                            value: ReviewAction.Skip,
                        }),
                    ]),
                })
            );
        });

        it('should prompt for budget change only', async () => {
            const newBudget = 'New Budget';
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateBudget);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { canSetBudget: true, budget: newBudget }
            );

            expect(result).toBe(ReviewAction.UpdateBudget);
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Apply these changes?'),
                    default: 'a',
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: 'a',
                            name: 'Update all',
                            value: ReviewAction.UpdateAll,
                        }),
                        expect.objectContaining({
                            key: 'b',
                            name: 'Update only the budget',
                            value: ReviewAction.UpdateBudget,
                        }),
                        expect.objectContaining({
                            key: 's',
                            name: 'Skip',
                            value: ReviewAction.Skip,
                        }),
                    ]),
                })
            );
        });

        it('should prompt for both category and budget changes', async () => {
            const newCategory = 'New Category';
            const newBudget = 'New Budget';
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { canSetBudget: true, category: newCategory, budget: newBudget }
            );

            expect(result).toBe(ReviewAction.UpdateAll);
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Apply these changes?'),
                    default: 'a',
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: 'a',
                            name: 'Update all',
                            value: ReviewAction.UpdateAll,
                        }),
                        expect.objectContaining({
                            key: 'b',
                            name: 'Update only the budget',
                            value: ReviewAction.UpdateBudget,
                        }),
                        expect.objectContaining({
                            key: 'c',
                            name: 'Update only the category',
                            value: ReviewAction.UpdateCategory,
                        }),
                        expect.objectContaining({
                            key: 's',
                            name: 'Skip',
                            value: ReviewAction.Skip,
                        }),
                    ]),
                })
            );
        });

        it('should handle undefined current values', async () => {
            const mockTransactionWithoutValues: Partial<TransactionSplit> = {
                description: 'Test Transaction',
                amount: '50.00',
                type: 'withdrawal',
                currency_symbol: '$',
            };

            const newCategory = 'New Category';
            const newBudget = 'New Budget';
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            const result = await service.askToUpdateTransaction(
                mockTransactionWithoutValues as TransactionSplit,
                mockTransactionId,
                { canSetBudget: true, category: newCategory, budget: newBudget }
            );

            expect(result).toBe(ReviewAction.UpdateAll);
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Apply these changes?'),
                    default: 'a',
                })
            );
        });

        it('should truncate long transaction descriptions', async () => {
            const longDescription = 'A'.repeat(100);
            const mockTransactionWithLongDesc: Partial<TransactionSplit> = {
                description: longDescription,
                category_name: 'Old Category',
                budget_name: 'Old Budget',
                amount: '25.00',
                type: 'withdrawal',
                currency_symbol: '$',
            };

            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            const result = await service.askToUpdateTransaction(
                mockTransactionWithLongDesc as TransactionSplit,
                mockTransactionId,
                { canSetBudget: true, category: 'New Category', budget: 'New Budget' }
            );

            expect(result).toBe(ReviewAction.UpdateAll);
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('...'),
                })
            );
        });

        it('turns Ctrl-C at the prompt into a ReviewCancelledError', async () => {
            // @inquirer/prompts rejects with an error named ExitPromptError
            mockExpand.mockRejectedValueOnce(
                Object.assign(new Error('User force closed the prompt with SIGINT'), {
                    name: 'ExitPromptError',
                })
            );

            await expect(
                service.askToUpdateTransaction(mockTransaction as TransactionSplit, '1', {
                    canSetBudget: true,
                    category: 'New Category',
                })
            ).rejects.toBeInstanceOf(ReviewCancelledError);
        });

        it('lets any other prompt failure through unchanged', async () => {
            const failure = new Error('stdin closed');
            mockExpand.mockRejectedValueOnce(failure);

            await expect(
                service.askToUpdateTransaction(mockTransaction as TransactionSplit, '1', {
                    canSetBudget: true,
                    category: 'New Category',
                })
            ).rejects.toBe(failure);
        });

        it('should return Skip when user selects abort option', async () => {
            const newCategory = 'New Category';
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { canSetBudget: true, category: newCategory }
            );

            expect(result).toBe(ReviewAction.Skip);
        });

        it('should show all update options including individual category and budget', async () => {
            const mockTransactionNoBudget: Partial<TransactionSplit> = {
                description: 'Test Transaction',
                category_name: 'Old Category',
                budget_name: undefined,
                amount: '34.99',
                type: 'withdrawal',
                currency_symbol: '$',
            };

            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            await service.askToUpdateTransaction(
                mockTransactionNoBudget as TransactionSplit,
                mockTransactionId,
                { canSetBudget: true, category: 'New Category' }
            );

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: 'a',
                            name: 'Update all',
                            value: ReviewAction.UpdateAll,
                        }),
                        expect.objectContaining({
                            key: 'b',
                            name: 'Update only the budget',
                            value: ReviewAction.UpdateBudget,
                        }),
                        expect.objectContaining({
                            key: 'c',
                            name: 'Update only the category',
                            value: ReviewAction.UpdateCategory,
                        }),
                        expect.objectContaining({
                            key: 's',
                            name: 'Skip',
                            value: ReviewAction.Skip,
                        }),
                    ]),
                })
            );
        });
    });

    describe('Amount display in update prompt', () => {
        it('should display withdrawal amount with negative sign', async () => {
            const withdrawal: Partial<TransactionSplit> = {
                description: 'Coffee Shop',
                type: 'withdrawal',
                amount: '4.50',
                currency_symbol: '$',
                category_name: 'Food',
            };
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            await service.askToUpdateTransaction(withdrawal as TransactionSplit, '1', {
                canSetBudget: true,
                category: 'Dining',
            });

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('-$4.50'),
                })
            );
        });

        it('should display deposit amount with positive sign', async () => {
            const deposit: Partial<TransactionSplit> = {
                description: 'Salary',
                type: 'deposit',
                amount: '3000.00',
                currency_symbol: '$',
                category_name: 'Income',
            };
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            await service.askToUpdateTransaction(deposit as TransactionSplit, '2', {
                canSetBudget: true,
                category: 'Salary',
            });

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('+$3000.00'),
                })
            );
        });

        it('should display transfer amount without sign', async () => {
            const transfer: Partial<TransactionSplit> = {
                description: 'Savings Transfer',
                type: 'transfer',
                amount: '500.00',
                currency_symbol: '$',
                category_name: 'Transfer',
            };
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            await service.askToUpdateTransaction(transfer as TransactionSplit, '3', {
                canSetBudget: true,
                category: 'Transfer',
            });

            const callArgs = mockExpand.mock.calls[0][0];
            expect(callArgs.message).toContain('$500.00');
            expect(callArgs.message).not.toContain('-$500.00');
            expect(callArgs.message).not.toContain('+$500.00');
        });

        it('should handle missing currency_symbol gracefully', async () => {
            const transaction: Partial<TransactionSplit> = {
                description: 'No Currency',
                type: 'withdrawal',
                amount: '10.00',
                category_name: 'Misc',
            };
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            await service.askToUpdateTransaction(transaction as TransactionSplit, '4', {
                canSetBudget: true,
                category: 'Other',
            });

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('-10.00'),
                })
            );
        });
    });

    describe('Base URL and Transaction Link Functionality', () => {
        const mockTransaction: Partial<TransactionSplit> = {
            description: 'Test Transaction',
            category_name: 'Old Category',
            budget_name: 'Old Budget',
            amount: '34.99',
            type: 'withdrawal',
            currency_symbol: '$',
        };

        it('should include hyperlink in description when transaction ID is provided', async () => {
            const transactionId = '123';
            const newCategory = 'New Category';
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                transactionId,
                { canSetBudget: true, category: newCategory }
            );

            const expectedLink = `${mockBaseUrl}/transactions/show/${transactionId}`;
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${mockTransaction.description}\x1B]8;;\x1B\\`;

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                })
            );
        });

        it('should not include hyperlink when transaction ID is undefined', async () => {
            const newCategory = 'New Category';
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            await service.askToUpdateTransaction(mockTransaction as TransactionSplit, undefined, {
                canSetBudget: true,
                category: newCategory,
            });

            // Should not contain ANSI escape sequences for hyperlinks
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.not.stringContaining('\x1B]8;;'),
                })
            );

            // Should contain the plain description
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(mockTransaction.description as string),
                })
            );
        });

        it('should include hyperlink with truncated description for long descriptions', async () => {
            const longDescription = 'A'.repeat(100);
            const mockTransactionWithLongDesc: Partial<TransactionSplit> = {
                description: longDescription,
                category_name: 'Old Category',
                amount: '25.00',
                type: 'withdrawal',
                currency_symbol: '$',
            };
            const transactionId = '456';
            const newCategory = 'New Category';
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            await service.askToUpdateTransaction(
                mockTransactionWithLongDesc as TransactionSplit,
                transactionId,
                { canSetBudget: true, category: newCategory }
            );

            const expectedLink = `${mockBaseUrl}/transactions/show/${transactionId}`;
            const truncatedDescription = longDescription.substring(0, 47) + '...';
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${truncatedDescription}\x1B]8;;\x1B\\`;

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                })
            );
        });

        it('should construct correct transaction URL with different base URLs', async () => {
            const customBaseUrl = 'https://firefly.example.com';
            const customService = new UserInputService(customBaseUrl);
            const transactionId = '789';
            const newBudget = 'New Budget';
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            await customService.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                transactionId,
                { canSetBudget: true, budget: newBudget }
            );

            const expectedLink = `${customBaseUrl}/transactions/show/${transactionId}`;
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${mockTransaction.description}\x1B]8;;\x1B\\`;

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                })
            );
        });

        it('should handle empty transaction ID as no hyperlink', async () => {
            const newCategory = 'New Category';
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            await service.askToUpdateTransaction(mockTransaction as TransactionSplit, '', {
                canSetBudget: true,
                category: newCategory,
            });

            // Empty string is falsy, so should not generate hyperlink
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.not.stringContaining('\x1B]8;;'),
                })
            );

            // Should contain the plain description
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(mockTransaction.description as string),
                })
            );
        });

        it('should properly format hyperlink with special characters in description', async () => {
            const specialDescTransaction: Partial<TransactionSplit> = {
                description: 'Transaction with & < > " \' special chars',
                category_name: 'Old Category',
                amount: '15.00',
                type: 'withdrawal',
                currency_symbol: '$',
            };
            const transactionId = '999';
            const newCategory = 'New Category';
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            await service.askToUpdateTransaction(
                specialDescTransaction as TransactionSplit,
                transactionId,
                { canSetBudget: true, category: newCategory }
            );

            const expectedLink = `${mockBaseUrl}/transactions/show/${transactionId}`;
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${specialDescTransaction.description}\x1B]8;;\x1B\\`;

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                })
            );
        });
    });

    describe('Deposit-specific behavior', () => {
        const mockDeposit: Partial<TransactionSplit> = {
            type: 'deposit',
            description: 'Paycheck Deposit',
            category_name: 'Salary',
            budget_name: undefined,
            amount: '2500.00',
            currency_symbol: '$',
        };

        it('should show Budget: N/A for deposits instead of None', async () => {
            mockExpand.mockResolvedValueOnce(ReviewAction.Skip);

            await service.askToUpdateTransaction(mockDeposit as TransactionSplit, '5', {
                canSetBudget: false,
                category: 'Salary',
            });

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Budget: N/A'),
                })
            );
        });

        it('should not show "Update only the budget" option for deposits', async () => {
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            await service.askToUpdateTransaction(mockDeposit as TransactionSplit, '5', {
                canSetBudget: false,
                category: 'Salary',
            });

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    choices: expect.not.arrayContaining([
                        expect.objectContaining({
                            key: 'b',
                            name: 'Update only the budget',
                        }),
                    ]),
                })
            );

            // Should still have other options
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: 'a',
                            name: 'Update all',
                        }),
                        expect.objectContaining({
                            key: 'c',
                            name: 'Update only the category',
                        }),
                    ]),
                })
            );
        });

        it('offers no budget on a withdrawal that cannot carry one (bill-linked)', async () => {
            const billPayment: Partial<TransactionSplit> = {
                type: 'withdrawal',
                description: 'Rent',
                bill_id: '7',
                amount: '1500.00',
                currency_symbol: '$',
            };
            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            await service.askToUpdateTransaction(billPayment as TransactionSplit, '5', {
                canSetBudget: false,
                category: 'Housing',
            });

            const { message, choices } = mockExpand.mock.calls[0][0];
            expect(message).toContain('Budget: N/A');
            expect(choices).not.toEqual(
                expect.arrayContaining([expect.objectContaining({ key: 'b' })])
            );
        });

        it('should allow all budget options for non-deposit transactions', async () => {
            const mockBill: Partial<TransactionSplit> = {
                type: 'withdrawal',
                description: 'Grocery Store',
                category_name: 'Food',
                budget_name: 'Groceries',
                amount: '87.50',
                currency_symbol: '$',
            };

            mockExpand.mockResolvedValueOnce(ReviewAction.UpdateAll);

            await service.askToUpdateTransaction(mockBill as TransactionSplit, '5', {
                canSetBudget: true,
                category: 'Food',
                budget: 'Groceries',
            });

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: 'b',
                            name: 'Update only the budget',
                        }),
                    ]),
                })
            );
        });
    });

    describe('getNewCategory and getNewBudget', () => {
        it('return the chosen name', async () => {
            mockSearch.mockResolvedValueOnce('Groceries').mockResolvedValueOnce('Food');

            expect(await service.getNewCategory(['Groceries'], undefined, 'Groceries')).toBe(
                'Groceries'
            );
            expect(await service.getNewBudget(['Food'], 'Food')).toBe('Food');
        });
    });

    describe('shouldEditCategoryBudget', () => {
        it('should include Modify Budget when a budget can be set', async () => {
            mockCheckbox.mockResolvedValueOnce([EditTransactionAttribute.Category]);

            await service.shouldEditCategoryBudget(true);

            expect(mockCheckbox).toHaveBeenCalledWith(
                expect.objectContaining({
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            name: 'Modify Category',
                            value: EditTransactionAttribute.Category,
                        }),
                        expect.objectContaining({
                            name: 'Modify Budget',
                            value: EditTransactionAttribute.Budget,
                        }),
                    ]),
                })
            );
        });

        it('should exclude Modify Budget when no budget can be set', async () => {
            mockCheckbox.mockResolvedValueOnce([EditTransactionAttribute.Category]);

            await service.shouldEditCategoryBudget(false);

            expect(mockCheckbox).toHaveBeenCalledWith(
                expect.objectContaining({
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            name: 'Modify Category',
                            value: EditTransactionAttribute.Category,
                        }),
                    ]),
                })
            );

            // Verify budget option is not in the choices
            const callArgs = mockCheckbox.mock.calls[0][0];
            expect(callArgs.choices).toHaveLength(1);
            expect(callArgs.choices).not.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'Modify Budget',
                    }),
                ])
            );
        });
    });

    describe('Split Transaction Methods', () => {
        describe('getSplitAmount', () => {
            it('should accept valid amount', async () => {
                mockInput.mockResolvedValue('60.00');

                const result = await service.getSplitAmount(100, '$');

                expect(result).toBe(60);
                expect(mockInput).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Enter amount for first split (original: $100):',
                    })
                );
            });

            it('should reject empty input', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate!;
                expect(validate('')).toBe('Amount is required');
                expect(validate('   ')).toBe('Amount is required');
            });

            it('should reject non-numeric input', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate!;
                expect(validate('abc')).toBe(
                    'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
                );
                expect(validate('12.abc')).toBe(
                    'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
                );
            });

            it('should reject more than 2 decimal places', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate!;
                expect(validate('50.123')).toBe(
                    'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
                );
            });

            it('should reject negative amounts', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate!;
                expect(validate('-50.00')).toBe(
                    'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
                );
            });

            it('should reject zero', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate!;
                expect(validate('0')).toBe('Amount must be greater than zero');
                expect(validate('0.00')).toBe('Amount must be greater than zero');
            });

            it('should reject amount less than 0.01', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate!;
                expect(validate('0.001')).toBe(
                    'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
                );
            });

            it('should reject amount >= original', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate!;
                expect(validate('100')).toBe('Amount must be less than the original amount ($100)');
                expect(validate('100.01')).toBe(
                    'Amount must be less than the original amount ($100)'
                );
            });

            it('should reject amount leaving < 0.01 for split 2', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate!;
                // 99.99 leaves exactly 0.01 which is the minimum, so it should be valid
                expect(validate('99.99')).toBe(true);
                // 99.991 would leave 0.009 which is < 0.01, but regex rejects it first
                expect(validate('99.995')).toBe(
                    'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
                );
            });

            it('should handle floating-point precision edge cases', async () => {
                mockInput.mockResolvedValue('3.37');

                await service.getSplitAmount(10.1, '$');

                const validate = mockInput.mock.calls[0][0].validate!;
                // 10.10 - 3.37 = 6.73, should be valid
                expect(validate('3.37')).toBe(true);
            });

            it('should accept valid amounts with proper decimal places', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate!;
                expect(validate('50')).toBe(true);
                expect(validate('50.5')).toBe(true);
                expect(validate('50.50')).toBe(true);
            });

            it('should trim whitespace from input', async () => {
                mockInput.mockResolvedValue('  50.00  ');

                const result = await service.getSplitAmount(100, '$');

                expect(result).toBe(50);
            });
        });

        describe('getCustomSplitText', () => {
            it('should return custom text', async () => {
                mockInput.mockResolvedValue('- Part 1');

                const result = await service.getCustomSplitText(1);

                expect(result).toBe('- Part 1');
                expect(mockInput).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Custom text for split 1 (press Enter to skip):',
                        default: '',
                    })
                );
            });

            it('should return empty string when skipped', async () => {
                mockInput.mockResolvedValue('');

                const result = await service.getCustomSplitText(2);

                expect(result).toBe('');
            });

            it('should use split number in prompt', async () => {
                mockInput.mockResolvedValue('');

                await service.getCustomSplitText(1);

                expect(mockInput).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Custom text for split 1 (press Enter to skip):',
                    })
                );
            });

            it('should trim whitespace from return value', async () => {
                mockInput.mockResolvedValue('  - Part 1  ');

                const result = await service.getCustomSplitText(1);

                // The implementation trims the result
                expect(result).toBe('- Part 1');
            });
        });

        describe('confirmSplit', () => {
            it('should return user confirmation', async () => {
                mockConfirm.mockResolvedValue(true);

                const result = await service.confirmSplit();

                expect(result).toBe(true);
                expect(mockConfirm).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Proceed with split?',
                        default: true,
                    })
                );
            });

            it('should default to true', async () => {
                mockConfirm.mockResolvedValue(true);

                await service.confirmSplit();

                expect(mockConfirm).toHaveBeenCalledWith(
                    expect.objectContaining({
                        default: true,
                    })
                );
            });

            it('should return false when user cancels', async () => {
                mockConfirm.mockResolvedValue(false);

                const result = await service.confirmSplit();

                expect(result).toBe(false);
            });
        });
    });
});
