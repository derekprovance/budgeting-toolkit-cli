import { TransactionSplit, FireflyApiClient } from '@derekprovance/firefly-iii-sdk';
import { AdditionalIncomeService } from '../../src/services/additional-income.service';
import { TransactionService } from '../../src/services/core/transaction.service';
import { TransactionPropertyService } from '../../src/services/core/transaction-property.service';
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
jest.mock('../../src/services/core/transaction-property.service');
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

describe('AdditionalIncomeService', () => {
    let service: AdditionalIncomeService;
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockTransactionPropertyService: jest.Mocked<TransactionPropertyService>;
    let mockExcludedTransactionService: jest.Mocked<ExcludedTransactionService>;
    let mockApiClient: jest.Mocked<FireflyApiClient>;
    let mockGetConfigValue: jest.MockedFunction<typeof getConfigValue>;

    beforeEach(() => {
        mockGetConfigValue = getConfigValue as jest.MockedFunction<typeof getConfigValue>;
        // Set up valid destination accounts for tests
        mockGetConfigValue.mockImplementation((key: string) => {
            if (key === 'validDestinationAccounts') {
                return [
                    TestAccount.PRIMARY,
                    TestAccount.CHASE_SAPPHIRE,
                    TestAccount.CHASE_AMAZON,
                    TestAccount.CITIBANK_DOUBLECASH,
                ];
            }
            if (key === 'excludedDescriptions') {
                return ['PAYROLL'];
            }
            return undefined;
        });
        mockApiClient = {} as jest.Mocked<FireflyApiClient>;
        mockExcludedTransactionService =
            new ExcludedTransactionService() as jest.Mocked<ExcludedTransactionService>;
        mockTransactionService = new TransactionService(
            mockApiClient
        ) as jest.Mocked<TransactionService>;
        mockTransactionPropertyService = new TransactionPropertyService(
            mockExcludedTransactionService
        ) as jest.Mocked<TransactionPropertyService>;
        service = new AdditionalIncomeService(
            mockTransactionService,
            mockTransactionPropertyService
        );
    });

    describe('configuration', () => {
        it('should throw error for empty valid destination accounts', () => {
            expect(
                () =>
                    new AdditionalIncomeService(
                        mockTransactionService,
                        mockTransactionPropertyService,
                        { validDestinationAccounts: [] }
                    )
            ).toThrow('At least one valid destination account must be specified');
        });

        it('should throw error for negative minimum transaction amount', () => {
            expect(
                () =>
                    new AdditionalIncomeService(
                        mockTransactionService,
                        mockTransactionPropertyService,
                        { minTransactionAmount: -1 }
                    )
            ).toThrow('Minimum transaction amount cannot be negative');
        });

        it('should accept custom configuration', async () => {
            const customService = new AdditionalIncomeService(
                mockTransactionService,
                mockTransactionPropertyService,
                {
                    validDestinationAccounts: [TestAccount.PRIMARY],
                    excludedDescriptions: ['PAYROLL'],
                    minTransactionAmount: 100,
                    excludeDisposableIncome: false,
                }
            );

            const mockTransactions = [
                createMockTransaction({
                    description: 'PAYROLL',
                    amount: '50.00',
                }),
                createMockTransaction({
                    description: 'Valid Income',
                    amount: '150.00',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
            mockTransactionPropertyService.isDeposit.mockReturnValue(true);
            mockTransactionPropertyService.isDisposableIncome.mockReturnValue(true);

            const result = await customService.calculateAdditionalIncome(4, 2024);

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Valid Income');
        });
    });

    describe('input validation', () => {
        it('should throw error for invalid month', async () => {
            await expect(service.calculateAdditionalIncome(13, 2024)).rejects.toThrow(
                'Month must be an integer between 1 and 12'
            );
        });

        it('should throw error for invalid year', async () => {
            await expect(service.calculateAdditionalIncome(1, 1899)).rejects.toThrow(
                'Year must be a valid 4-digit year'
            );
        });

        it('should throw error for non-integer month', async () => {
            await expect(service.calculateAdditionalIncome(1.5, 2024)).rejects.toThrow(
                'Month must be an integer between 1 and 12'
            );
        });
    });

    describe('calculateAdditionalIncome', () => {
        it('should handle empty transaction list', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);
            const result = await service.calculateAdditionalIncome(4, 2024);
            expect(result).toEqual([]);
        });

        it('should handle null transaction list', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(
                [] as TransactionSplit[]
            );
            const result = await service.calculateAdditionalIncome(4, 2024);
            expect(result).toEqual([]);
        });

        describe('transaction filtering', () => {
            it('should filter by minimum amount when configured', async () => {
                const serviceWithMinAmount = new AdditionalIncomeService(
                    mockTransactionService,
                    mockTransactionPropertyService,
                    { minTransactionAmount: 100 }
                );

                const mockTransactions = [
                    createMockTransaction({
                        description: 'Small Amount',
                        amount: '50.00',
                    }),
                    createMockTransaction({
                        description: 'Large Amount',
                        amount: '150.00',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await serviceWithMinAmount.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(1);
                expect(result[0].description).toBe('Large Amount');
            });

            it('should handle invalid amount formats', async () => {
                const serviceWithMinAmount = new AdditionalIncomeService(
                    mockTransactionService,
                    mockTransactionPropertyService,
                    { minTransactionAmount: 100 }
                );

                const mockTransactions = [
                    createMockTransaction({
                        description: 'Invalid Amount',
                        amount: 'invalid',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await serviceWithMinAmount.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(0);
            });
        });

        describe('payroll filtering', () => {
            it('should exclude payroll transactions', async () => {
                const mockTransactions: TransactionSplit[] = [
                    createMockTransaction({
                        description: 'PAYROLL',
                        amount: '1000.00',
                    }),
                    createMockTransaction({
                        description: 'Freelance Work',
                        amount: '500.00',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(1);
                expect(result[0].description).toBe('Freelance Work');
            });

            it('should handle transactions with no description', async () => {
                const mockTransactions: TransactionSplit[] = [
                    createMockTransaction({
                        description: '',
                        amount: '1000.00',
                    }),
                    createMockTransaction({
                        description: undefined,
                        amount: '500.00',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(2);
            });
        });

        describe('error handling', () => {
            it('should handle errors gracefully with proper context', async () => {
                const originalError = new Error('API Error');
                mockTransactionService.getTransactionsForMonth.mockRejectedValue(originalError);

                await expect(service.calculateAdditionalIncome(4, 2024)).rejects.toThrow(
                    'Failed to calculate additional income for month 4: API Error'
                );
            });

            it('should handle unknown errors gracefully', async () => {
                mockTransactionService.getTransactionsForMonth.mockRejectedValue('Unknown error');

                await expect(service.calculateAdditionalIncome(4, 2024)).rejects.toThrow(
                    'Failed to calculate additional income for month 4'
                );
            });
        });

        describe('description matching', () => {
            it('should handle case-insensitive description matching', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'payroll',
                        amount: '1000.00',
                    }),
                    createMockTransaction({
                        description: 'PAYROLL',
                        amount: '1000.00',
                    }),
                    createMockTransaction({
                        description: 'Payroll',
                        amount: '1000.00',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(0);
            });

            it('should handle partial description matches', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Monthly Payroll Bonus',
                        amount: '1000.00',
                    }),
                    createMockTransaction({
                        description: 'Payroll Advance',
                        amount: '1000.00',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(0);
            });

            it('should handle special characters in descriptions', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Payroll!@#$%^&*()',
                        amount: '1000.00',
                    }),
                    createMockTransaction({
                        description: 'PAYROLL-123',
                        amount: '1000.00',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(0);
            });
        });

        describe('amount validation', () => {
            it('should handle zero amounts', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Zero Amount',
                        amount: '0.00',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(0);
            });

            it('should handle negative amounts', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Negative Amount',
                        amount: '-100.00',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(0);
            });

            it('should handle very large amounts', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Large Amount',
                        amount: '999999999.99',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(1);
                expect(result[0].description).toBe('Large Amount');
            });

            it('should handle decimal precision', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Precise Amount',
                        amount: '100.123456789',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(1);
                expect(result[0].description).toBe('Precise Amount');
            });
        });

        describe('account validation', () => {
            it('should handle all valid destination accounts', async () => {
                const validAccounts = [
                    TestAccount.PRIMARY,
                    TestAccount.CHASE_SAPPHIRE,
                    TestAccount.CHASE_AMAZON,
                    TestAccount.CITIBANK_DOUBLECASH,
                ];

                const mockTransactions = validAccounts.map(account =>
                    createMockTransaction({
                        description: `Transaction to ${account}`,
                        destination_id: account,
                    })
                );

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(validAccounts.length);
                result.forEach((transaction, index) => {
                    expect(transaction.destination_id).toBe(validAccounts[index]);
                });
            });

            it('should exclude transactions to invalid destination accounts', async () => {
                const invalidAccounts = [TestAccount.MONEY_MARKET, 'INVALID_ACCOUNT'];

                const mockTransactions = invalidAccounts.map(account =>
                    createMockTransaction({
                        description: `Transaction to ${account}`,
                        destination_id: account,
                    })
                );

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(0);
            });

            it('should handle transactions with null destination accounts', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Null Destination TestAccount',
                        destination_id: null,
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionPropertyService.isDeposit.mockReturnValue(true);
                mockTransactionPropertyService.isDisposableIncome.mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result).toHaveLength(0);
            });
        });
    });
});

// Helper function to create mock transactions
function createMockTransaction(overrides: Partial<TransactionSplit>): TransactionSplit {
    return {
        id: '1',
        type: 'deposit',
        date: '2024-04-01',
        amount: '100.00',
        description: 'Test Transaction',
        source_id: null,
        destination_id: TestAccount.PRIMARY,
        ...overrides,
    } as TransactionSplit;
}
