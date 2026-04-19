import { jest } from '@jest/globals';
import { SplitTransactionCommand } from '../../src/commands/split-transaction.command.js';
import { TransactionSplitService } from '../../src/services/transaction-split.service.js';
import { SplitTransactionDisplayService } from '../../src/services/display/split-transaction-display.service.js';
import { UserInputService } from '../../src/services/user-input.service.js';
import { TransactionRead } from '@derekprovance/firefly-iii-sdk';

// Mock ora spinner
jest.mock('ora', () => {
    const spinnerInstance = {
        start: jest.fn().mockReturnThis(),
        succeed: jest.fn().mockReturnThis(),
        fail: jest.fn().mockReturnThis(),
        stop: jest.fn().mockReturnThis(),
    };
    return jest.fn(() => spinnerInstance);
});

// Mock chalk to return the input string (disable styling for tests)
jest.mock('chalk', () => ({
    default: {
        red: (str: string) => str,
        yellow: (str: string) => str,
        green: (str: string) => str,
    },
}));

// Mock services
jest.mock('../../src/services/transaction-split.service');
jest.mock('../../src/services/display/split-transaction-display.service');
jest.mock('../../src/services/user-input.service');

describe('SplitTransactionCommand', () => {
    let command: SplitTransactionCommand;
    let splitService: jest.Mocked<TransactionSplitService>;
    let displayService: jest.Mocked<SplitTransactionDisplayService>;
    let userInputService: jest.Mocked<UserInputService>;
    let consoleLogSpy: jest.Spied<typeof console.log>;

    const createMockTransactionRead = (overrides?: Partial<TransactionRead>): TransactionRead => ({
        type: 'transactions',
        id: '123',
        attributes: {
            transactions: [
                {
                    transaction_journal_id: 'journal-123',
                    type: 'withdrawal',
                    date: '2024-01-15',
                    amount: '100.00',
                    description: 'Test Transaction',
                    source_id: 'source-1',
                    source_name: 'Checking Account',
                    destination_id: 'dest-1',
                    destination_name: 'Test Store',
                    currency_id: 'curr-1',
                    currency_code: 'USD',
                    currency_symbol: '$',
                    category_name: 'Test Category',
                    budget_id: 'budget-1',
                    budget_name: 'Test Budget',
                    tags: [],
                },
            ],
        },
        ...overrides,
    });

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup service mocks
        splitService = {
            getTransaction: jest.fn(),
            splitTransaction: jest.fn(),
            validateSplitAmounts: jest.fn(),
        } as unknown as jest.Mocked<TransactionSplitService>;

        displayService = {
            formatHeader: jest.fn().mockReturnValue('Mock Header'),
            formatOriginalTransaction: jest.fn().mockReturnValue('Mock Original'),
            formatRemainder: jest.fn().mockReturnValue('Mock Remainder'),
            formatSplitPreview: jest.fn().mockReturnValue('Mock Preview'),
            formatSuccess: jest.fn().mockReturnValue('Mock Success'),
            formatError: jest.fn().mockReturnValue('Mock Error'),
        } as unknown as jest.Mocked<SplitTransactionDisplayService>;

        userInputService = {
            promptForAction: jest.fn(),
            promptForCategory: jest.fn(),
            promptForBudget: jest.fn(),
            promptForEditChoices: jest.fn(),
            confirm: jest.fn(),
            getSplitAmount: jest.fn(),
            getCustomSplitText: jest.fn(),
            confirmSplit: jest.fn(),
            validateSplitAmount: jest.fn().mockReturnValue(true),
        } as unknown as jest.Mocked<UserInputService>;

        // Create command instance
        command = new SplitTransactionCommand(splitService, displayService, userInputService);

        // Spy on console
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    describe('execute', () => {
        it('should split transaction successfully in non-interactive mode with all parameters', async () => {
            const mockTransaction = createMockTransactionRead();
            splitService.getTransaction.mockResolvedValue(mockTransaction);
            splitService.splitTransaction.mockResolvedValue({
                success: true,
                transaction: mockTransaction,
            });

            await command.execute({
                transactionId: '123',
                amount: '60.00',
                descriptions: ['- Part 1', '- Part 2'],
                yes: true,
            });

            expect(splitService.getTransaction).toHaveBeenCalledWith('123');
            expect(userInputService.getSplitAmount).not.toHaveBeenCalled();
            expect(userInputService.getCustomSplitText).not.toHaveBeenCalled();
            expect(userInputService.confirmSplit).not.toHaveBeenCalled();
            expect(splitService.splitTransaction).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalled();
        });

        it('should throw error when transaction is not found', async () => {
            splitService.getTransaction.mockResolvedValue(undefined);

            await expect(
                command.execute({
                    transactionId: '999',
                    amount: '60.00',
                    descriptions: ['- Part 1', '- Part 2'],
                    yes: true,
                })
            ).rejects.toThrow('Transaction 999 not found');

            expect(userInputService.getSplitAmount).not.toHaveBeenCalled();
            expect(splitService.splitTransaction).not.toHaveBeenCalled();
        });

        it('should throw error when transaction already has multiple splits', async () => {
            const mockTransaction = createMockTransactionRead({
                attributes: {
                    transactions: [
                        {
                            transaction_journal_id: 'journal-1',
                            type: 'withdrawal',
                            date: '2024-01-15',
                            amount: '60.00',
                            description: 'Split 1',
                            source_id: 'source-1',
                            destination_id: 'dest-1',
                            currency_code: 'USD',
                            currency_symbol: '$',
                        },
                        {
                            transaction_journal_id: 'journal-2',
                            type: 'withdrawal',
                            date: '2024-01-15',
                            amount: '40.00',
                            description: 'Split 2',
                            source_id: 'source-1',
                            destination_id: 'dest-1',
                            currency_code: 'USD',
                            currency_symbol: '$',
                        },
                    ],
                },
            });
            splitService.getTransaction.mockResolvedValue(mockTransaction);

            await expect(
                command.execute({
                    transactionId: '123',
                    amount: '60.00',
                    descriptions: ['- Part 1', '- Part 2'],
                    yes: true,
                })
            ).rejects.toThrow('Transaction already has 2 splits');

            expect(splitService.splitTransaction).not.toHaveBeenCalled();
        });

        it('should throw error when amount validation fails', async () => {
            const mockTransaction = createMockTransactionRead();
            splitService.getTransaction.mockResolvedValue(mockTransaction);
            userInputService.validateSplitAmount.mockReturnValue('Amount must be positive');

            await expect(
                command.execute({
                    transactionId: '123',
                    amount: '-50.00',
                    descriptions: ['- Part 1', '- Part 2'],
                    yes: true,
                })
            ).rejects.toThrow('Amount must be positive');

            expect(splitService.splitTransaction).not.toHaveBeenCalled();
        });

        it('should handle split service returning failure', async () => {
            const mockTransaction = createMockTransactionRead();
            splitService.getTransaction.mockResolvedValue(mockTransaction);
            splitService.splitTransaction.mockResolvedValue({
                success: false,
                error: new Error('API error'),
            });

            await command.execute({
                transactionId: '123',
                amount: '60.00',
                descriptions: ['- Part 1', '- Part 2'],
                yes: true,
            });

            expect(displayService.formatError).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalled();
        });

        it('should cancel split when user does not confirm', async () => {
            const mockTransaction = createMockTransactionRead();
            splitService.getTransaction.mockResolvedValue(mockTransaction);
            userInputService.confirmSplit.mockResolvedValue(false);

            await command.execute({
                transactionId: '123',
                amount: '60.00',
                descriptions: ['- Part 1', '- Part 2'],
                yes: false,
            });

            expect(splitService.splitTransaction).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Split cancelled'));
        });

        it('should prompt for split amount when not provided via CLI', async () => {
            const mockTransaction = createMockTransactionRead();
            splitService.getTransaction.mockResolvedValue(mockTransaction);
            userInputService.getSplitAmount.mockResolvedValue(60);
            userInputService.getCustomSplitText.mockResolvedValue('');
            userInputService.confirmSplit.mockResolvedValue(true);
            splitService.splitTransaction.mockResolvedValue({
                success: true,
                transaction: mockTransaction,
            });

            await command.execute({
                transactionId: '123',
                // amount not provided
                descriptions: ['- Part 1', '- Part 2'],
                yes: false,
            });

            expect(userInputService.getSplitAmount).toHaveBeenCalledWith(100, '$');
            expect(splitService.splitTransaction).toHaveBeenCalled();
        });

        it('should prompt for custom text when descriptions not provided via CLI', async () => {
            const mockTransaction = createMockTransactionRead();
            splitService.getTransaction.mockResolvedValue(mockTransaction);
            userInputService.getSplitAmount.mockResolvedValue(60);
            userInputService.getCustomSplitText.mockResolvedValue(' - custom text');
            userInputService.confirmSplit.mockResolvedValue(true);
            splitService.splitTransaction.mockResolvedValue({
                success: true,
                transaction: mockTransaction,
            });

            await command.execute({
                transactionId: '123',
                amount: '60.00',
                // descriptions not provided
                yes: false,
            });

            expect(userInputService.getCustomSplitText).toHaveBeenCalledTimes(2);
            expect(userInputService.getCustomSplitText).toHaveBeenNthCalledWith(1, 1);
            expect(userInputService.getCustomSplitText).toHaveBeenNthCalledWith(2, 2);
            expect(splitService.splitTransaction).toHaveBeenCalled();
        });

        it('should handle transaction with no splits array', async () => {
            const mockTransaction = createMockTransactionRead({
                attributes: {
                    transactions: [],
                },
            });
            splitService.getTransaction.mockResolvedValue(mockTransaction);

            await expect(
                command.execute({
                    transactionId: '123',
                    amount: '60.00',
                    descriptions: ['- Part 1', '- Part 2'],
                    yes: true,
                })
            ).rejects.toThrow('Transaction has no splits');

            expect(splitService.splitTransaction).not.toHaveBeenCalled();
        });

        it('should use yes flag to skip confirmation prompt', async () => {
            const mockTransaction = createMockTransactionRead();
            splitService.getTransaction.mockResolvedValue(mockTransaction);
            splitService.splitTransaction.mockResolvedValue({
                success: true,
                transaction: mockTransaction,
            });

            await command.execute({
                transactionId: '123',
                amount: '60.00',
                descriptions: ['- Part 1', '- Part 2'],
                yes: true,
            });

            expect(userInputService.confirmSplit).not.toHaveBeenCalled();
            expect(splitService.splitTransaction).toHaveBeenCalled();
        });

        it('should handle transaction without currency symbol (use default)', async () => {
            const mockTransaction = createMockTransactionRead({
                attributes: {
                    transactions: [
                        {
                            transaction_journal_id: 'journal-123',
                            type: 'withdrawal',
                            date: '2024-01-15',
                            amount: '100.00',
                            description: 'Test Transaction',
                            source_id: 'source-1',
                            destination_id: 'dest-1',
                            currency_code: 'USD',
                            // currency_symbol missing
                        },
                    ],
                },
            });
            splitService.getTransaction.mockResolvedValue(mockTransaction);
            userInputService.getSplitAmount.mockResolvedValue(60);
            userInputService.getCustomSplitText.mockResolvedValue('');
            userInputService.confirmSplit.mockResolvedValue(true);
            splitService.splitTransaction.mockResolvedValue({
                success: true,
                transaction: mockTransaction,
            });

            await command.execute({
                transactionId: '123',
                // amount not provided - will trigger prompt with default currency
                yes: false,
            });

            expect(userInputService.getSplitAmount).toHaveBeenCalledWith(100, '$');
        });

        it('should calculate remainder amount correctly with floating point precision', async () => {
            const mockTransaction = createMockTransactionRead({
                attributes: {
                    transactions: [
                        {
                            transaction_journal_id: 'journal-123',
                            type: 'withdrawal',
                            date: '2024-01-15',
                            amount: '100.33',
                            description: 'Test Transaction',
                            source_id: 'source-1',
                            destination_id: 'dest-1',
                            currency_code: 'USD',
                            currency_symbol: '$',
                        },
                    ],
                },
            });
            splitService.getTransaction.mockResolvedValue(mockTransaction);
            splitService.splitTransaction.mockResolvedValue({
                success: true,
                transaction: mockTransaction,
            });

            await command.execute({
                transactionId: '123',
                amount: '60.15',
                descriptions: ['- Part 1', '- Part 2'],
                yes: true,
            });

            expect(displayService.formatRemainder).toHaveBeenCalledWith(40.18, '$');
            expect(splitService.splitTransaction).toHaveBeenCalledWith(
                '123',
                '60.15',
                expect.objectContaining({
                    amount: '60.15',
                }),
                expect.objectContaining({
                    amount: '40.18',
                })
            );
        });
    });
});
