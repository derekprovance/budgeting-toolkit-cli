import { jest } from '@jest/globals';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { UpdateTransactionMode } from '../../src/types/enum/update-transaction-mode.enum.js';

// Create mock functions first
const mockExpand = jest.fn();
const mockCheckbox = jest.fn();
const mockSelect = jest.fn();
const mockSearch = jest.fn();
const mockInput = jest.fn();
const mockConfirm = jest.fn();

// Mock chalk to return the input string (disable styling for tests)
jest.unstable_mockModule('chalk', () => ({
    default: {
        redBright: (str: string) => str,
        cyan: (str: string) => str,
        yellow: (str: string) => str,
        gray: (str: string) => str,
        bold: (str: string) => str,
    },
}));

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
const { UserInputService } = await import('../../src/services/user-input.service.js');

describe('UserInputService', () => {
    let service: UserInputService;

    const mockBaseUrl = 'http://derek.pro';

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

    describe('askToUpdateTransaction', () => {
        const mockTransaction: Partial<TransactionSplit> = {
            description: 'Test Transaction',
            category_name: 'Old Category',
            budget_name: 'Old Budget',
        };

        const mockTransactionId = '5';

        it('should throw error when transaction is null', async () => {
            await expect(
                service.askToUpdateTransaction(
                    null as unknown as TransactionSplit,
                    mockTransactionId,
                    {}
                )
            ).rejects.toThrow('Transaction cannot be null or undefined');
        });

        it('should return Skip when no changes are proposed', async () => {
            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                {
                    category: mockTransaction.category_name ?? undefined,
                    budget: mockTransaction.budget_name ?? undefined,
                }
            );

            expect(result).toBe(UpdateTransactionMode.Skip);
            expect(mockExpand).not.toHaveBeenCalled();
        });

        it('should prompt for category change only', async () => {
            const newCategory = 'New Category';
            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Category);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { category: newCategory }
            );

            expect(result).toBe(UpdateTransactionMode.Category);
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Apply these changes?'),
                    default: 'a',
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: 'a',
                            name: 'Update all',
                            value: UpdateTransactionMode.Both,
                        }),
                        expect.objectContaining({
                            key: 'c',
                            name: 'Update only the category',
                            value: UpdateTransactionMode.Category,
                        }),
                        expect.objectContaining({
                            key: 's',
                            name: 'Skip',
                            value: UpdateTransactionMode.Skip,
                        }),
                    ]),
                })
            );
        });

        it('should prompt for budget change only', async () => {
            const newBudget = 'New Budget';
            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Budget);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { budget: newBudget }
            );

            expect(result).toBe(UpdateTransactionMode.Budget);
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Apply these changes?'),
                    default: 'a',
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: 'a',
                            name: 'Update all',
                            value: UpdateTransactionMode.Both,
                        }),
                        expect.objectContaining({
                            key: 'b',
                            name: 'Update only the budget',
                            value: UpdateTransactionMode.Budget,
                        }),
                        expect.objectContaining({
                            key: 's',
                            name: 'Skip',
                            value: UpdateTransactionMode.Skip,
                        }),
                    ]),
                })
            );
        });

        it('should prompt for both category and budget changes', async () => {
            const newCategory = 'New Category';
            const newBudget = 'New Budget';
            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Both);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { category: newCategory, budget: newBudget }
            );

            expect(result).toBe(UpdateTransactionMode.Both);
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Apply these changes?'),
                    default: 'a',
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: 'a',
                            name: 'Update all',
                            value: UpdateTransactionMode.Both,
                        }),
                        expect.objectContaining({
                            key: 'b',
                            name: 'Update only the budget',
                            value: UpdateTransactionMode.Budget,
                        }),
                        expect.objectContaining({
                            key: 'c',
                            name: 'Update only the category',
                            value: UpdateTransactionMode.Category,
                        }),
                        expect.objectContaining({
                            key: 's',
                            name: 'Skip',
                            value: UpdateTransactionMode.Skip,
                        }),
                    ]),
                })
            );
        });

        it('should handle undefined current values', async () => {
            const mockTransactionWithoutValues: Partial<TransactionSplit> = {
                description: 'Test Transaction',
            };

            const newCategory = 'New Category';
            const newBudget = 'New Budget';
            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Both);

            const result = await service.askToUpdateTransaction(
                mockTransactionWithoutValues as TransactionSplit,
                mockTransactionId,
                { category: newCategory, budget: newBudget }
            );

            expect(result).toBe(UpdateTransactionMode.Both);
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
            };

            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Both);

            const result = await service.askToUpdateTransaction(
                mockTransactionWithLongDesc as TransactionSplit,
                mockTransactionId,
                { category: 'New Category', budget: 'New Budget' }
            );

            expect(result).toBe(UpdateTransactionMode.Both);
            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('...'),
                })
            );
        });

        it('should return Skip when user selects abort option', async () => {
            const newCategory = 'New Category';
            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Skip);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { category: newCategory }
            );

            expect(result).toBe(UpdateTransactionMode.Skip);
        });

        it('should show only Update all and Skip choices when only category is proposed but matches budget', async () => {
            const mockTransactionNoBudget: Partial<TransactionSplit> = {
                description: 'Test Transaction',
                category_name: 'Old Category',
                budget_name: undefined,
            };

            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(
                mockTransactionNoBudget as TransactionSplit,
                mockTransactionId,
                { category: 'New Category' }
            );

            expect(mockExpand).toHaveBeenCalledWith(
                expect.objectContaining({
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: 'a',
                            name: 'Update all',
                            value: UpdateTransactionMode.Both,
                        }),
                        expect.objectContaining({
                            key: 'c',
                            name: 'Update only the category',
                            value: UpdateTransactionMode.Category,
                        }),
                        expect.objectContaining({
                            key: 's',
                            name: 'Skip',
                            value: UpdateTransactionMode.Skip,
                        }),
                    ]),
                })
            );
            // Should not have budget option
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
        });
    });

    describe('Base URL and Transaction Link Functionality', () => {
        const mockTransaction: Partial<TransactionSplit> = {
            description: 'Test Transaction',
            category_name: 'Old Category',
            budget_name: 'Old Budget',
        };

        it('should include hyperlink in description when transaction ID is provided', async () => {
            const transactionId = '123';
            const newCategory = 'New Category';
            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                transactionId,
                { category: newCategory }
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
            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(mockTransaction as TransactionSplit, undefined, {
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
            };
            const transactionId = '456';
            const newCategory = 'New Category';
            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(
                mockTransactionWithLongDesc as TransactionSplit,
                transactionId,
                { category: newCategory }
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
            mockExpand.mockResolvedValueOnce(UpdateTransactionMode.Both);

            await customService.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                transactionId,
                { budget: newBudget }
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
            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(mockTransaction as TransactionSplit, '', {
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
            };
            const transactionId = '999';
            const newCategory = 'New Category';
            (mockExpand as jest.Mock).mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(
                specialDescTransaction as TransactionSplit,
                transactionId,
                { category: newCategory }
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

                const validate = mockInput.mock.calls[0][0].validate;
                expect(validate('')).toBe('Amount is required');
                expect(validate('   ')).toBe('Amount is required');
            });

            it('should reject non-numeric input', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate;
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

                const validate = mockInput.mock.calls[0][0].validate;
                expect(validate('50.123')).toBe(
                    'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
                );
            });

            it('should reject negative amounts', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate;
                expect(validate('-50.00')).toBe(
                    'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
                );
            });

            it('should reject zero', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate;
                expect(validate('0')).toBe('Amount must be greater than zero');
                expect(validate('0.00')).toBe('Amount must be greater than zero');
            });

            it('should reject amount less than 0.01', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate;
                expect(validate('0.001')).toBe(
                    'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
                );
            });

            it('should reject amount >= original', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate;
                expect(validate('100')).toBe('Amount must be less than the original amount ($100)');
                expect(validate('100.01')).toBe('Amount must be less than the original amount ($100)');
            });

            it('should reject amount leaving < 0.01 for split 2', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate;
                // 99.99 leaves exactly 0.01 which is the minimum, so it should be valid
                expect(validate('99.99')).toBe(true);
                // 99.991 would leave 0.009 which is < 0.01, but regex rejects it first
                expect(validate('99.995')).toBe(
                    'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
                );
            });

            it('should handle floating-point precision edge cases', async () => {
                mockInput.mockResolvedValue('3.37');

                await service.getSplitAmount(10.10, '$');

                const validate = mockInput.mock.calls[0][0].validate;
                // 10.10 - 3.37 = 6.73, should be valid
                expect(validate('3.37')).toBe(true);
            });

            it('should accept valid amounts with proper decimal places', async () => {
                mockInput.mockResolvedValue('50.00');

                await service.getSplitAmount(100, '$');

                const validate = mockInput.mock.calls[0][0].validate;
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

        describe('shouldCustomizeSplit', () => {
            it('should return user confirmation for split 1', async () => {
                mockConfirm.mockResolvedValue(true);

                const result = await service.shouldCustomizeSplit(1);

                expect(result).toBe(true);
                expect(mockConfirm).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Customize category/budget for split 1?',
                        default: false,
                    })
                );
            });

            it('should return user confirmation for split 2', async () => {
                mockConfirm.mockResolvedValue(false);

                const result = await service.shouldCustomizeSplit(2);

                expect(result).toBe(false);
                expect(mockConfirm).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Customize category/budget for split 2?',
                        default: false,
                    })
                );
            });

            it('should default to false', async () => {
                mockConfirm.mockResolvedValue(false);

                await service.shouldCustomizeSplit(1);

                expect(mockConfirm).toHaveBeenCalledWith(
                    expect.objectContaining({
                        default: false,
                    })
                );
            });
        });

        describe('getCustomSplitText', () => {
            it('should return custom text', async () => {
                mockInput.mockResolvedValue('- Part 1');

                const result = await service.getCustomSplitText(1, 'Original Description');

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

                const result = await service.getCustomSplitText(2, 'Original');

                expect(result).toBe('');
            });

            it('should use split number in prompt', async () => {
                mockInput.mockResolvedValue('');

                await service.getCustomSplitText(1, 'AMAZON PURCHASE');

                expect(mockInput).toHaveBeenCalledWith(
                    expect.objectContaining({
                        message: 'Custom text for split 1 (press Enter to skip):',
                    })
                );
            });

            it('should trim whitespace from return value', async () => {
                mockInput.mockResolvedValue('  - Part 1  ');

                const result = await service.getCustomSplitText(1, 'Original');

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
