import '../setup/mock-logger.js'; // Must be first to mock logger module
import { resetMockLogger } from '../setup/mock-logger.js';
import { jest } from '@jest/globals';
import { TransactionSplit, TransactionRead } from '@derekprovance/firefly-iii-sdk';
import { AdditionalIncomeService } from '../../src/services/additional-income.service.js';
import { ITransactionService } from '../../src/services/core/transaction.service.interface.js';
import { ITransactionClassificationService } from '../../src/services/core/transaction-classification.service.interface.js';
import { createMockAccountScopeService } from '../setup/mock-services.js';

// Test account IDs - these are hardcoded for test isolation
const TestAccount = {
    PRIMARY: 'test-primary-account',
    CREDIT_CARD_A: 'test-credit-card-a',
    CREDIT_CARD_B: 'test-credit-card-b',
    CREDIT_CARD_C: 'test-credit-card-c',
    MONEY_MARKET: 'test-money-market',
} as const;

describe('AdditionalIncomeService', () => {
    let service: AdditionalIncomeService;
    let mockTransactionService: jest.Mocked<ITransactionService>;
    let mockTransactionClassificationService: jest.Mocked<ITransactionClassificationService>;

    beforeEach(() => {
        resetMockLogger();

        // Create mock service objects
        mockTransactionService = {
            getTransactionsForMonth:
                jest.fn<(month: number, year: number) => Promise<TransactionSplit[]>>(),
            getMostRecentTransactionDate: jest.fn<() => Promise<Date | null>>(),
            getTransactionsByTag: jest.fn<(tag: string) => Promise<TransactionSplit[]>>(),
            tagExists: jest.fn<(tag: string) => Promise<boolean>>(),
            updateTransaction:
                jest.fn<
                    (
                        transaction: TransactionSplit,
                        category?: string,
                        budgetId?: string
                    ) => Promise<TransactionRead | undefined>
                >(),
            getTransactionReadBySplit:
                jest.fn<(splitTransaction: TransactionSplit) => TransactionRead | undefined>(),
            clearCache: jest.fn<() => void>(),
        } as unknown as jest.Mocked<ITransactionService>;

        mockTransactionClassificationService = {
            isTransfer: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isBill: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isDisposableIncome: jest.fn<(transaction: TransactionSplit) => boolean>(),
            hasNoDestination: jest.fn<(destinationId: string | null) => boolean>(),
            isSupplementedByDisposable: jest.fn<(tags: string[] | null | undefined) => boolean>(),
            isDeposit: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isWithdrawal: jest.fn<(transaction: TransactionSplit) => boolean>(),
            hasACategory: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isPaycheck: jest
                .fn<(transaction: TransactionSplit) => boolean>()
                .mockReturnValue(false),
        } as unknown as jest.Mocked<ITransactionClassificationService>;

        service = new AdditionalIncomeService(
            mockTransactionService,
            mockTransactionClassificationService,
            createMockAccountScopeService([
                TestAccount.PRIMARY,
                TestAccount.CREDIT_CARD_A,
                TestAccount.CREDIT_CARD_B,
                TestAccount.CREDIT_CARD_C,
            ]),
            ['PAYROLL'],
            true
        );
    });

    describe('configuration', () => {
        it('should return nothing when the resolved scope has no destinations', async () => {
            // No longer a constructor error: the scope is resolved at analysis
            // time from Firefly, and AccountScopeService owns the empty case.
            const emptyScopeService = new AdditionalIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                createMockAccountScopeService([]),
                ['PAYROLL'],
                true
            );

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                createMockTransaction({ description: 'Valid Income', amount: '50.00' }),
            ] as never);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            const result = await emptyScopeService.calculateAdditionalIncome(1, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual([]);
            }
        });

        it('should accept custom configuration', async () => {
            const customService = new AdditionalIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                createMockAccountScopeService([TestAccount.PRIMARY]),
                ['PAYROLL'],
                false
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
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);

            const result = await customService.calculateAdditionalIncome(4, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toHaveLength(1);
                expect(result.value[0].description).toBe('Valid Income');
            }
        });
    });

    describe('input validation', () => {
        it('should return error for invalid month', async () => {
            const result = await service.calculateAdditionalIncome(13, 2024);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain('Month must be an integer between 1 and 12');
            }
        });

        it('should return error for invalid year', async () => {
            const result = await service.calculateAdditionalIncome(1, 1899);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain('Year must be a valid 4-digit year');
            }
        });

        it('should return error for non-integer month', async () => {
            const result = await service.calculateAdditionalIncome(1.5, 2024);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain('Month must be an integer between 1 and 12');
            }
        });
    });

    describe('calculateAdditionalIncome', () => {
        it('should handle empty transaction list', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);
            const result = await service.calculateAdditionalIncome(4, 2024);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual([]);
            }
        });

        it('should handle null transaction list', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(
                [] as TransactionSplit[]
            );
            const result = await service.calculateAdditionalIncome(4, 2024);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual([]);
            }
        });

        describe('transaction filtering', () => {
            it('should filter negative numbers', async () => {
                const serviceWithMinAmount = new AdditionalIncomeService(
                    mockTransactionService,
                    mockTransactionClassificationService,
                    createMockAccountScopeService([
                        TestAccount.PRIMARY,
                        TestAccount.CREDIT_CARD_A,
                        TestAccount.CREDIT_CARD_B,
                        TestAccount.CREDIT_CARD_C,
                    ]),
                    ['PAYROLL'],
                    true
                );

                const mockTransactions = [
                    createMockTransaction({
                        description: 'Small Amount',
                        amount: '-50.00',
                    }),
                    createMockTransaction({
                        description: 'Large Amount',
                        amount: '150.00',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await serviceWithMinAmount.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(1);
                    expect(result.value[0].description).toBe('Large Amount');
                }
            });

            it('should handle invalid amount formats', async () => {
                const serviceWithMinAmount = new AdditionalIncomeService(
                    mockTransactionService,
                    mockTransactionClassificationService,
                    createMockAccountScopeService([
                        TestAccount.PRIMARY,
                        TestAccount.CREDIT_CARD_A,
                        TestAccount.CREDIT_CARD_B,
                        TestAccount.CREDIT_CARD_C,
                    ]),
                    ['PAYROLL'],
                    true
                );

                const mockTransactions = [
                    createMockTransaction({
                        description: 'Invalid Amount',
                        amount: 'invalid',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await serviceWithMinAmount.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(0);
                }
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
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(1);
                    expect(result.value[0].description).toBe('Freelance Work');
                }
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
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(2);
                }
            });
        });

        describe('error handling', () => {
            it('should handle errors gracefully with proper context', async () => {
                const originalError = new Error('API Error');
                mockTransactionService.getTransactionsForMonth.mockRejectedValue(originalError);

                const result = await service.calculateAdditionalIncome(4, 2024);
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error.message).toContain(
                        'Failed to fetch transactions for month 4'
                    );
                    expect(result.error.message).toContain('API Error');
                }
            });

            it('should handle unknown errors gracefully', async () => {
                mockTransactionService.getTransactionsForMonth.mockRejectedValue('Unknown error');

                const result = await service.calculateAdditionalIncome(4, 2024);
                expect(result.ok).toBe(false);
                if (!result.ok) {
                    expect(result.error.message).toContain(
                        'Failed to fetch transactions for month 4'
                    );
                    expect(result.error.message).toContain('Unknown error');
                }
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
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(0);
                }
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
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(0);
                }
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
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(0);
                }
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
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(0);
                }
            });

            it('should exclude paycheck-tagged deposits', async () => {
                // Regression: paychecks are counted by PaycheckSurplusService.
                // Counting them here too double-counted income in the net.
                const mockTransactions = [
                    createMockTransaction({ description: 'ACME PAYROLL', amount: '1234.56' }),
                    createMockTransaction({ description: 'Side gig', amount: '100.00' }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);
                (mockTransactionClassificationService.isPaycheck as jest.Mock).mockImplementation(
                    (t: TransactionSplit) => t.description === 'ACME PAYROLL'
                );

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(1);
                    expect(result.value[0].description).toBe('Side gig');
                }
            });

            it('should handle very large amounts', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Large Amount',
                        amount: '999999999.99',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(1);
                    expect(result.value[0].description).toBe('Large Amount');
                }
            });

            it('should handle decimal precision', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Precise Amount',
                        amount: '100.123456789',
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(1);
                    expect(result.value[0].description).toBe('Precise Amount');
                }
            });
        });

        describe('account validation', () => {
            it('should handle all valid destination accounts', async () => {
                const validAccounts = [
                    TestAccount.PRIMARY,
                    TestAccount.CREDIT_CARD_A,
                    TestAccount.CREDIT_CARD_B,
                    TestAccount.CREDIT_CARD_C,
                ];

                const mockTransactions = validAccounts.map(account =>
                    createMockTransaction({
                        description: `Transaction to ${account}`,
                        destination_id: account,
                    })
                );

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(validAccounts.length);
                    result.value.forEach((transaction, index) => {
                        expect(transaction.destination_id).toBe(validAccounts[index]);
                    });
                }
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
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(0);
                }
            });

            it('should handle transactions with null destination accounts', async () => {
                const mockTransactions = [
                    createMockTransaction({
                        description: 'Null Destination TestAccount',
                        destination_id: null,
                    }),
                ];

                mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);
                mockTransactionClassificationService.isDeposit.mockReturnValue(true);
                (
                    mockTransactionClassificationService.isDisposableIncome as jest.Mock
                ).mockReturnValue(false);

                const result = await service.calculateAdditionalIncome(4, 2024);

                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value).toHaveLength(0);
                }
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
