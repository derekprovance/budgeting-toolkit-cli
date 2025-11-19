import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs';
import { UnbudgetedExpenseService } from '../../src/services/unbudgeted-expense.service';
import { TransactionService } from '../../src/services/core/transaction.service';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service';
import { ExcludedTransactionService } from '../../src/services/excluded-transaction.service';
import { getConfigValue } from '../../src/utils/config-loader';

// Test account IDs - these are hardcoded for test isolation
const TestAccount = {
    PRIMARY: 'test-primary-account',
    CHASE_SAPPHIRE: 'test-chase-sapphire',
    CHASE_AMAZON: 'test-chase-amazon',
    CITIBANK_DOUBLECASH: 'test-citibank-doublecash',
    MONEY_MARKET: 'test-money-market',
} as const;

// Mock dependencies
jest.mock('../../src/services/core/transaction.service');
jest.mock('../../src/services/core/transaction-classification.service');
jest.mock('../../src/services/excluded-transaction.service');
jest.mock('../../src/utils/config-loader', () => ({
    getConfigValue: jest.fn(),
}));
jest.mock('../../src/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    },
}));

describe('UnbudgetedExpenseService', () => {
    let service: UnbudgetedExpenseService;
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockTransactionClassificationService: jest.Mocked<TransactionClassificationService>;
    let mockGetConfigValue: jest.MockedFunction<typeof getConfigValue>;

    beforeEach(() => {
        mockGetConfigValue = getConfigValue as jest.MockedFunction<typeof getConfigValue>;
        // Set up valid expense accounts for tests
        mockGetConfigValue.mockImplementation((key: string) => {
            if (key === 'validExpenseAccounts') {
                return [
                    TestAccount.CHASE_AMAZON,
                    TestAccount.CHASE_SAPPHIRE,
                    TestAccount.CITIBANK_DOUBLECASH,
                    TestAccount.PRIMARY,
                ];
            }
            if (key === 'validTransfers') {
                return [
                    {
                        source: TestAccount.PRIMARY,
                        destination: TestAccount.MONEY_MARKET,
                    },
                ];
            }
            return undefined;
        });
        const mockApiClient = {} as jest.Mocked<FireflyClientWithCerts>;
        const mockExcludedTransactionService =
            new ExcludedTransactionService() as jest.Mocked<ExcludedTransactionService>;
        mockTransactionService = new TransactionService(
            mockApiClient
        ) as jest.Mocked<TransactionService>;
        mockTransactionClassificationService = new TransactionClassificationService(
            mockExcludedTransactionService
        ) as jest.Mocked<TransactionClassificationService>;
        service = new UnbudgetedExpenseService(
            mockTransactionService,
            mockTransactionClassificationService
        );
    });

    describe('input validation', () => {
        it('should throw error for invalid month (less than 1)', async () => {
            await expect(service.calculateUnbudgetedExpenses(0, 2024)).rejects.toThrow(
                'Month must be an integer between 1 and 12'
            );
        });

        it('should throw error for invalid month (greater than 12)', async () => {
            await expect(service.calculateUnbudgetedExpenses(13, 2024)).rejects.toThrow(
                'Month must be an integer between 1 and 12'
            );
        });

        it('should throw error for non-integer month', async () => {
            await expect(service.calculateUnbudgetedExpenses(1.5, 2024)).rejects.toThrow(
                'Month must be an integer between 1 and 12'
            );
        });

        it('should throw error for invalid year (less than 1900)', async () => {
            await expect(service.calculateUnbudgetedExpenses(1, 1899)).rejects.toThrow(
                'Year must be a valid 4-digit year'
            );
        });

        it('should throw error for invalid year (greater than 9999)', async () => {
            await expect(service.calculateUnbudgetedExpenses(1, 10000)).rejects.toThrow(
                'Year must be a valid 4-digit year'
            );
        });

        it('should throw error for non-integer year', async () => {
            await expect(service.calculateUnbudgetedExpenses(1, 2024.5)).rejects.toThrow(
                'Year must be a valid 4-digit year'
            );
        });
    });

    describe('calculateUnbudgetedExpenses', () => {
        it('should handle empty transaction list', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);
            const result = await service.calculateUnbudgetedExpenses(4, 2024);
            expect(result).toEqual([]);
        });

        it('should handle null transaction list', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(
                [] as TransactionSplit[]
            );
            const result = await service.calculateUnbudgetedExpenses(4, 2024);
            expect(result).toEqual([]);
        });

        it('should filter out transactions with budgets', async () => {
            const mockTransactions = [
                createMockTransaction({
                    description: 'Budgeted Expense',
                    budget_id: '123',
                    source_id: TestAccount.PRIMARY,
                }),
                createMockTransaction({
                    description: 'Unbudgeted Expense',
                    budget_id: null,
                    source_id: TestAccount.PRIMARY,
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);
            mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
            mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
            mockTransactionClassificationService.isBill.mockReturnValue(false);

            const result = await service.calculateUnbudgetedExpenses(4, 2024);

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Unbudgeted Expense');
        });

        it('should filter out excluded transactions', async () => {
            const mockTransactions = [
                createMockTransaction({
                    description: 'Excluded Expense',
                    source_id: TestAccount.PRIMARY,
                }),
                createMockTransaction({
                    description: 'Valid Expense',
                    source_id: TestAccount.PRIMARY,
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);
            mockTransactionClassificationService.isExcludedTransaction
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);
            mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
            mockTransactionClassificationService.isBill.mockReturnValue(false);

            const result = await service.calculateUnbudgetedExpenses(4, 2024);

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Valid Expense');
        });

        it('should filter out disposable income supplemented transactions', async () => {
            const mockTransactions = [
                createMockTransaction({
                    description: 'Disposable Supplemented',
                    source_id: TestAccount.PRIMARY,
                }),
                createMockTransaction({
                    description: 'Regular Expense',
                    source_id: TestAccount.PRIMARY,
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);
            mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
            mockTransactionClassificationService.isSupplementedByDisposable
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockTransactionClassificationService.isBill.mockReturnValue(false);

            const result = await service.calculateUnbudgetedExpenses(4, 2024);

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Regular Expense');
        });

        it('should handle transfers from PRIMARY to MONEY_MARKET', async () => {
            const mockTransactions = [
                createMockTransaction({
                    description: 'Valid Transfer',
                    source_id: TestAccount.PRIMARY,
                    destination_id: TestAccount.MONEY_MARKET,
                }),
                createMockTransaction({
                    description: 'Invalid Transfer',
                    source_id: TestAccount.PRIMARY,
                    destination_id: TestAccount.CHASE_SAPPHIRE,
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
            mockTransactionClassificationService.isTransfer.mockReturnValue(true);
            mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
            mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
            mockTransactionClassificationService.isBill.mockReturnValue(false);

            const result = await service.calculateUnbudgetedExpenses(4, 2024);

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Valid Transfer');
        });

        it('should filter out non-expense account transactions', async () => {
            const mockTransactions = [
                createMockTransaction({
                    description: 'Non-Expense TestAccount',
                    source_id: TestAccount.MONEY_MARKET,
                }),
                createMockTransaction({
                    description: 'Expense TestAccount',
                    source_id: TestAccount.PRIMARY,
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);
            mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
            mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
            mockTransactionClassificationService.isBill.mockReturnValue(false);

            const result = await service.calculateUnbudgetedExpenses(4, 2024);

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Expense TestAccount');
        });

        it('should include bills regardless of other criteria', async () => {
            const mockTransactions = [
                createMockTransaction({
                    description: 'Regular Bill',
                    source_id: TestAccount.CHASE_SAPPHIRE,
                    tags: ['Bills'],
                }),
                createMockTransaction({
                    description: 'Regular Expense',
                    source_id: TestAccount.PRIMARY,
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);
            mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
            mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
            mockTransactionClassificationService.isBill
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);

            const result = await service.calculateUnbudgetedExpenses(4, 2024);

            expect(result).toHaveLength(2);
            expect(result[0].description).toBe('Regular Bill');
            expect(result[1].description).toBe('Regular Expense');
        });

        it('should include bills even if they have a budget', async () => {
            const mockTransactions = [
                createMockTransaction({
                    description: 'Budgeted Bill',
                    source_id: TestAccount.CHASE_SAPPHIRE,
                    budget_id: '123',
                    tags: ['Bills'],
                }),
                createMockTransaction({
                    description: 'Regular Expense',
                    source_id: TestAccount.PRIMARY,
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);
            mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
            mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
            mockTransactionClassificationService.isBill
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);

            const result = await service.calculateUnbudgetedExpenses(4, 2024);

            expect(result).toHaveLength(2);
            expect(result[0].description).toBe('Budgeted Bill');
            expect(result[1].description).toBe('Regular Expense');
        });

        it('should include bills even if they are excluded', async () => {
            const mockTransactions = [
                createMockTransaction({
                    description: 'Excluded Bill',
                    source_id: TestAccount.CHASE_SAPPHIRE,
                    tags: ['Bills'],
                }),
                createMockTransaction({
                    description: 'Regular Expense',
                    source_id: TestAccount.PRIMARY,
                    budget_id: null,
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);
            mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
            mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
            mockTransactionClassificationService.isBill
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);

            const result = await service.calculateUnbudgetedExpenses(4, 2024);

            expect(result).toHaveLength(2);
            expect(result[0].description).toBe('Excluded Bill');
            expect(result[1].description).toBe('Regular Expense');
            expect(mockTransactionClassificationService.isExcludedTransaction).toHaveBeenCalledTimes(1);
        });

        it('should include expenses from all valid expense accounts', async () => {
            const mockTransactions = [
                createMockTransaction({
                    description: 'Chase Amazon Expense',
                    source_id: TestAccount.CHASE_AMAZON,
                }),
                createMockTransaction({
                    description: 'Chase Sapphire Expense',
                    source_id: TestAccount.CHASE_SAPPHIRE,
                }),
                createMockTransaction({
                    description: 'Citi Double Cash Expense',
                    source_id: TestAccount.CITIBANK_DOUBLECASH,
                }),
                createMockTransaction({
                    description: 'Primary TestAccount Expense',
                    source_id: TestAccount.PRIMARY,
                }),
                createMockTransaction({
                    description: 'Invalid TestAccount Expense',
                    source_id: 'invalid-account',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);
            mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
            mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
            mockTransactionClassificationService.isBill.mockReturnValue(false);

            const result = await service.calculateUnbudgetedExpenses(4, 2024);

            expect(result).toHaveLength(4);
            expect(result.map(t => t.description)).toEqual([
                'Chase Amazon Expense',
                'Chase Sapphire Expense',
                'Citi Double Cash Expense',
                'Primary TestAccount Expense',
            ]);
        });

        describe('error handling', () => {
            it('should handle API errors with proper context', async () => {
                const error = new Error('API Error');
                mockTransactionService.getTransactionsForMonth.mockRejectedValue(error);

                await expect(service.calculateUnbudgetedExpenses(4, 2024)).rejects.toThrow(
                    'Failed to calculate unbudgeted expenses for month 4: API Error'
                );
            });

            it('should handle unknown errors gracefully', async () => {
                mockTransactionService.getTransactionsForMonth.mockRejectedValue('Unknown error');

                await expect(service.calculateUnbudgetedExpenses(4, 2024)).rejects.toThrow(
                    'Failed to calculate unbudgeted expenses for month 4'
                );
            });

            it('should include month and year in error context', async () => {
                const error = new Error('API Error');
                mockTransactionService.getTransactionsForMonth.mockRejectedValue(error);

                try {
                    await service.calculateUnbudgetedExpenses(4, 2024);
                } catch (e) {
                    expect(e).toBeInstanceOf(Error);
                    expect((e as Error).message).toContain('month 4');
                }
            });
        });

        describe('bill edge cases', () => {
            it('should include bills even with disposable income tags', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Bill with Disposable',
                        source_id: TestAccount.CHASE_SAPPHIRE,
                        tags: ['Bills', 'Disposable'],
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isTransfer.mockReturnValue(false);
                mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
                mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(true);
                mockTransactionClassificationService.isBill.mockReturnValue(true);

                const result = await service.calculateUnbudgetedExpenses(4, 2024);

                expect(result).toHaveLength(1);
                expect(result[0].description).toBe('Bill with Disposable');
            });

            it('should include bills from non-expense accounts', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Bill from Non-Expense',
                        source_id: TestAccount.MONEY_MARKET,
                        tags: ['Bills'],
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isTransfer.mockReturnValue(false);
                mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
                mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
                mockTransactionClassificationService.isBill.mockReturnValue(true);

                const result = await service.calculateUnbudgetedExpenses(4, 2024);

                expect(result).toHaveLength(1);
                expect(result[0].description).toBe('Bill from Non-Expense');
            });

            it('should include bills even if they are excluded transactions', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Excluded Bill',
                        source_id: TestAccount.PRIMARY,
                        tags: ['Bills'],
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isTransfer.mockReturnValue(false);
                mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(true);
                mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
                mockTransactionClassificationService.isBill.mockReturnValue(true);

                const result = await service.calculateUnbudgetedExpenses(4, 2024);

                expect(result).toHaveLength(1);
                expect(result[0].description).toBe('Excluded Bill');
            });
        });

        describe('transfer edge cases', () => {
            it('should handle transfers with no source account', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'No Source Transfer',
                        source_id: null,
                        destination_id: TestAccount.MONEY_MARKET,
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isTransfer.mockReturnValue(true);
                mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
                mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
                mockTransactionClassificationService.isBill.mockReturnValue(false);

                const result = await service.calculateUnbudgetedExpenses(4, 2024);

                expect(result).toHaveLength(0);
            });

            it('should handle transfers with no destination account', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'No Destination Transfer',
                        source_id: TestAccount.PRIMARY,
                        destination_id: null,
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isTransfer.mockReturnValue(true);
                mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
                mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
                mockTransactionClassificationService.isBill.mockReturnValue(false);

                const result = await service.calculateUnbudgetedExpenses(4, 2024);

                expect(result).toHaveLength(1);
                expect(result[0].description).toBe('No Destination Transfer');
            });

            it('should exclude transfers between invalid accounts', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Invalid Transfer',
                        source_id: TestAccount.CHASE_SAPPHIRE,
                        destination_id: TestAccount.MONEY_MARKET,
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isTransfer.mockReturnValue(true);
                mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
                mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
                mockTransactionClassificationService.isBill.mockReturnValue(false);

                const result = await service.calculateUnbudgetedExpenses(4, 2024);

                expect(result).toHaveLength(0);
            });
        });

        describe('account validation', () => {
            it('should handle transactions from all valid expense accounts', async () => {
                const validAccounts = [
                    TestAccount.PRIMARY,
                    TestAccount.CHASE_AMAZON,
                    TestAccount.CHASE_SAPPHIRE,
                    TestAccount.CITIBANK_DOUBLECASH,
                ];

                const mockTransactions = validAccounts.map(account =>
                    createMockTransaction({
                        description: `Transaction from ${account}`,
                        source_id: account,
                    })
                );

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isTransfer.mockReturnValue(false);
                mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
                mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
                mockTransactionClassificationService.isBill.mockReturnValue(false);

                const result = await service.calculateUnbudgetedExpenses(4, 2024);

                expect(result).toHaveLength(validAccounts.length);
                result.forEach((transaction, index) => {
                    expect(transaction.source_id).toBe(validAccounts[index]);
                });
            });

            it('should exclude transactions from invalid accounts', async () => {
                const invalidAccounts = [TestAccount.MONEY_MARKET, 'INVALID_ACCOUNT'];

                const mockTransactions = invalidAccounts.map(account =>
                    createMockTransaction({
                        description: `Transaction from ${account}`,
                        source_id: account,
                    })
                );

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isTransfer.mockReturnValue(false);
                mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
                mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
                mockTransactionClassificationService.isBill.mockReturnValue(false);

                const result = await service.calculateUnbudgetedExpenses(4, 2024);

                expect(result).toHaveLength(0);
            });

            it('should handle transactions with null source accounts', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Null Source TestAccount',
                        source_id: null,
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isTransfer.mockReturnValue(false);
                mockTransactionClassificationService.isExcludedTransaction.mockResolvedValue(false);
                mockTransactionClassificationService.isSupplementedByDisposable.mockReturnValue(false);
                mockTransactionClassificationService.isBill.mockReturnValue(false);

                const result = await service.calculateUnbudgetedExpenses(4, 2024);

                expect(result).toHaveLength(0);
            });
        });
    });
});

// Helper function to create mock transactions
function createMockTransaction(overrides: Partial<TransactionSplit>): TransactionSplit {
    return {
        id: '1',
        type: 'withdrawal',
        date: '2024-04-01',
        amount: '100.00',
        description: 'Test Transaction',
        source_id: null,
        destination_id: null,
        budget_id: null,
        tags: [],
        ...overrides,
    } as TransactionSplit;
}
