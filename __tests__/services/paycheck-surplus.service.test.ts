import '../setup/mock-logger.js'; // Must be first to mock logger module
import { mockLogger, resetMockLogger } from '../setup/mock-logger.js';
import { jest } from '@jest/globals';
import { PaycheckSurplusService } from '../../src/services/paycheck-surplus.service.js';
import { ITransactionService } from '../../src/services/core/transaction.service.interface.js';
import { ITransactionClassificationService } from '../../src/services/core/transaction-classification.service.interface.js';
import { TransactionSplit, TransactionRead } from '@derekprovance/firefly-iii-sdk';

describe('PaycheckSurplusService', () => {
    let service: PaycheckSurplusService;
    let mockTransactionService: jest.Mocked<ITransactionService>;
    let mockTransactionClassificationService: jest.Mocked<ITransactionClassificationService>;

    beforeEach(() => {
        resetMockLogger();
        jest.clearAllMocks();

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
            isExcludedTransaction:
                jest.fn<(description: string, amount: string) => Promise<boolean>>(),
            isDeposit: jest.fn<(transaction: TransactionSplit) => boolean>(),
            hasACategory: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isPaycheck: jest.fn<(transaction: TransactionSplit) => boolean>(),
        } as unknown as jest.Mocked<ITransactionClassificationService>;

        service = new PaycheckSurplusService(
            mockTransactionService,
            mockTransactionClassificationService,
            5000, // Expected monthly paycheck for tests
            mockLogger
        );
    });

    describe('calculatePaycheckSurplus', () => {
        const mockPaycheck = (amount: string, hasPaycheckTag: boolean = true): TransactionSplit =>
            ({
                amount,
                tags: hasPaycheckTag ? ['Paycheck'] : [],
                transaction_journal_id: '123',
                type: 'transfer',
            }) as TransactionSplit;

        it('should calculate surplus when actual paychecks exceed expected amount', async () => {
            // Arrange
            const paychecks = [mockPaycheck('3000.00'), mockPaycheck('3000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isPaycheck.mockImplementation(
                t => t.tags?.includes('Paycheck') ?? false
            );

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(1000.0);
                expect(mockLogger.debug).toHaveBeenCalledWith(
                    expect.objectContaining({
                        month: 1,
                        year: 2024,
                        expectedPaycheckAmount: 5000.0,
                        totalPaycheckAmount: 6000.0,
                        surplus: 1000.0,
                        paycheckCount: 2,
                    }),
                    'Calculated paycheck surplus'
                );
            }
        });

        it('should calculate deficit when actual paychecks are less than expected amount', async () => {
            // Arrange
            const paychecks = [mockPaycheck('2000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isPaycheck.mockImplementation(
                t => t.tags?.includes('Paycheck') ?? false
            );

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(-3000.0);
            }
        });

        it('should handle no paychecks found', async () => {
            // Arrange
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);
            mockTransactionClassificationService.isPaycheck.mockReturnValue(false);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(-5000.0);
            }
        });

        it('should handle missing expected paycheck amount configuration', async () => {
            // Arrange
            const paychecks = [mockPaycheck('3000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isPaycheck.mockImplementation(
                t => t.tags?.includes('Paycheck') ?? false
            );

            // Create local logger mock for this test
            const testMockLogger = {
                debug: jest.fn<(obj: unknown, msg: string) => void>(),
                warn: jest.fn<(msg: string) => void>(),
                error: jest.fn<(obj: unknown, msg: string) => void>(),
                trace: jest.fn<(obj: unknown, msg: string) => void>(),
                info: jest.fn<(obj: unknown, msg: string) => void>(),
            };

            const testService = new PaycheckSurplusService(
                mockTransactionService,
                mockTransactionClassificationService,
                undefined, // Testing with undefined expected paycheck
                testMockLogger
            );

            // Act
            const result = await testService.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(3000.0);
                expect(testMockLogger.warn).toHaveBeenCalledWith(
                    'Expected monthly paycheck amount not configured'
                );
            }
        });

        it('should handle invalid paycheck amounts', async () => {
            // Arrange
            const validPaycheck = mockPaycheck('3000.00');
            const invalidPaycheck = {
                amount: 'invalid',
                tags: ['Paycheck'],
                transaction_journal_id: '124',
                type: 'transfer',
            } as TransactionSplit;

            const paychecks = [validPaycheck, invalidPaycheck];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isPaycheck.mockImplementation(
                t => t.tags?.includes('Paycheck') ?? false
            );

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(-2000.0);
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    {
                        transaction: {
                            amount: 'invalid',
                            tags: ['Paycheck'],
                            transaction_journal_id: '124',
                            type: 'transfer',
                        },
                    },
                    'Invalid transaction amount found'
                );
            }
        });

        it('should handle API errors', async () => {
            // Arrange
            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('API Error')
            );

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain('Failed to fetch transactions for month 1');
                expect(result.error.message).toContain('API Error');
            }
            // New error handling logs with more specific context
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'API Error',
                    month: 1,
                    year: 2024,
                    operation: 'calculatePaycheckSurplus',
                }),
                'Failed to fetch transactions'
            );
        });

        it('should handle invalid month/year', async () => {
            // Act
            const result = await service.calculatePaycheckSurplus(13, 2024);

            // Assert
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain(
                    'Invalid date provided for calculatePaycheckSurplus'
                );
            }
        });
    });

    describe('findPaychecks with tag-based identification', () => {
        it('should identify deposit-type paychecks with tag', async () => {
            // Arrange
            const depositPaycheck = {
                type: 'deposit',
                amount: '3000.00',
                tags: ['Paycheck'],
                transaction_journal_id: '123',
                description: 'Monthly paycheck',
            } as TransactionSplit;

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([depositPaycheck]);
            mockTransactionClassificationService.isPaycheck.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(-2000.0); // 3000 - 5000
            }
        });

        it('should identify transfer-type paychecks with tag', async () => {
            // Arrange
            const transferPaycheck = {
                type: 'transfer',
                amount: '3000.00',
                tags: ['Paycheck'],
                transaction_journal_id: '123',
                description: 'Transfer from business account',
            } as TransactionSplit;

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([transferPaycheck]);
            mockTransactionClassificationService.isPaycheck.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(-2000.0); // 3000 - 5000
            }
        });

        it('should support both deposit and transfer type paychecks in same month', async () => {
            // Arrange
            const depositPaycheck = {
                type: 'deposit',
                amount: '2000.00',
                tags: ['Paycheck'],
                transaction_journal_id: '123',
            } as TransactionSplit;

            const transferPaycheck = {
                type: 'transfer',
                amount: '3000.00',
                tags: ['Paycheck'],
                transaction_journal_id: '124',
            } as TransactionSplit;

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                depositPaycheck,
                transferPaycheck,
            ]);
            mockTransactionClassificationService.isPaycheck.mockImplementation(
                t => t.tags?.includes('Paycheck') ?? false
            );

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(0); // 2000 + 3000 = 5000 (matches expected)
            }
        });

        it('should NOT identify transactions without paycheck tag', async () => {
            // Arrange
            const regularTransfer = {
                type: 'transfer',
                amount: '500.00',
                tags: ['Other'],
                transaction_journal_id: '123',
                description: 'Transfer to savings',
            } as TransactionSplit;

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([regularTransfer]);
            mockTransactionClassificationService.isPaycheck.mockReturnValue(false);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(-5000.0); // No paychecks found
            }
        });

        it('should identify transaction with multiple tags including paycheck tag', async () => {
            // Arrange
            const paycheckWithMultipleTags = {
                type: 'transfer',
                amount: '3000.00',
                tags: ['Paycheck', 'Work', 'Income'],
                transaction_journal_id: '123',
            } as TransactionSplit;

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                paycheckWithMultipleTags,
            ]);
            mockTransactionClassificationService.isPaycheck.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(-2000.0); // 3000 - 5000
            }
        });

        it('should handle transaction with null tags', async () => {
            // Arrange
            const transactionNoTags = {
                type: 'deposit',
                amount: '3000.00',
                tags: null,
                transaction_journal_id: '123',
            } as unknown as TransactionSplit;

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([transactionNoTags]);
            mockTransactionClassificationService.isPaycheck.mockReturnValue(false);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(-5000.0); // No paychecks identified
            }
        });

        it('should sort paychecks by amount descending', async () => {
            // Arrange
            const smallPaycheck = {
                type: 'deposit',
                amount: '1000.00',
                tags: ['Paycheck'],
                transaction_journal_id: '123',
            } as TransactionSplit;

            const largePaycheck = {
                type: 'transfer',
                amount: '4000.00',
                tags: ['Paycheck'],
                transaction_journal_id: '124',
            } as TransactionSplit;

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                smallPaycheck,
                largePaycheck,
            ]);

            // Mock isPaycheck to return true for both
            mockTransactionClassificationService.isPaycheck.mockImplementation(
                t => t.tags?.includes('Paycheck') ?? false
            );

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                // 1000 + 4000 = 5000 - 5000 = 0
                expect(result.value).toBe(0);
                // Verify that debug logging was called with the paycheck identification info
                expect(mockLogger.debug).toHaveBeenCalledWith(
                    expect.objectContaining({
                        paychecksFound: 2,
                    }),
                    'Paycheck search completed'
                );
            }
        });
    });
});
