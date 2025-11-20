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
        } as unknown as jest.Mocked<ITransactionClassificationService>;

        service = new PaycheckSurplusService(
            mockTransactionService,
            mockTransactionClassificationService,
            5000, // Expected monthly paycheck for tests
            mockLogger
        );
    });

    describe('calculatePaycheckSurplus', () => {
        const mockPaycheck = (amount: string): TransactionSplit =>
            ({
                amount,
                category_name: 'Paycheck',
                source_type: 'Revenue account',
            }) as TransactionSplit;

        it('should calculate surplus when actual paychecks exceed expected amount', async () => {
            // Arrange
            const paychecks = [mockPaycheck('3000.00'), mockPaycheck('3000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(1000.0);
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
        });

        it('should calculate deficit when actual paychecks are less than expected amount', async () => {
            // Arrange
            const paychecks = [mockPaycheck('2000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(-3000.0);
        });

        it('should handle no paychecks found', async () => {
            // Arrange
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(-5000.0);
        });

        it('should handle missing expected paycheck amount configuration', async () => {
            // Arrange
            const paychecks = [mockPaycheck('3000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Create local logger mock for this test
            const testMockLogger = {
                debug: jest.fn<(obj: unknown, msg: string) => void>(),
                warn: jest.fn<(obj: unknown, msg: string) => void>(),
                error: jest.fn<(obj: unknown, msg: string) => void>(),
                trace: jest.fn<(obj: unknown, msg: string) => void>(),
                info: jest.fn<(obj: unknown, msg: string) => void>(),
            };

            const testService = new PaycheckSurplusService(
                mockTransactionService,
                mockTransactionClassificationService,
                null as any, // Testing with null expected paycheck
                testMockLogger
            );

            // Act
            const result = await testService.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(3000.0);
            expect(testMockLogger.warn).toHaveBeenCalledWith(
                { expectedMonthlyPaycheck: null },
                'Expected monthly paycheck amount not configured'
            );
        });

        it('should handle invalid expected paycheck amount', async () => {
            // Arrange
            const paychecks = [mockPaycheck('3000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Create local logger mock for this test
            const testMockLogger = {
                debug: jest.fn<(obj: unknown, msg: string) => void>(),
                warn: jest.fn<(obj: unknown, msg: string) => void>(),
                error: jest.fn<(obj: unknown, msg: string) => void>(),
                trace: jest.fn<(obj: unknown, msg: string) => void>(),
                info: jest.fn<(obj: unknown, msg: string) => void>(),
            };

            const testService = new PaycheckSurplusService(
                mockTransactionService,
                mockTransactionClassificationService,
                'invalid', // Testing with invalid expected paycheck
                testMockLogger
            );

            // Act
            const result = await testService.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(3000.0);
            expect(testMockLogger.error).toHaveBeenCalledWith(
                { expectedMonthlyPaycheck: 'invalid' },
                'Invalid expected monthly paycheck amount'
            );
        });

        it('should handle invalid paycheck amounts', async () => {
            // Arrange
            const paychecks = [mockPaycheck('3000.00'), mockPaycheck('invalid')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(-2000.0);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                {
                    paycheck: {
                        amount: 'invalid',
                        category_name: 'Paycheck',
                        source_type: 'Revenue account',
                    },
                },
                'Invalid paycheck amount found'
            );
        });

        it('should handle API errors', async () => {
            // Arrange
            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('API Error')
            );

            // Act & Assert
            await expect(service.calculatePaycheckSurplus(1, 2024)).rejects.toThrow(
                'Failed to find paychecks for month 1'
            );
            expect(mockLogger.error).toHaveBeenCalledWith(
                {
                    error: 'API Error',
                    type: 'Error',
                    month: 1,
                    year: 2024,
                },
                'Failed to find paychecks'
            );
        });

        it('should handle invalid month/year', async () => {
            // Act & Assert - DateUtils.validateMonthYear will throw for invalid month
            await expect(service.calculatePaycheckSurplus(13, 2024)).rejects.toThrow(
                'Failed to find paychecks for month 13'
            );
        });
    });

    describe('isPaycheck', () => {
        it('should identify valid paycheck transactions', () => {
            const transaction = {
                category_name: 'Paycheck',
                source_type: 'Revenue account',
            } as TransactionSplit;

            const result = (
                service as unknown as {
                    isPaycheck: (t: TransactionSplit) => boolean;
                }
            ).isPaycheck(transaction);
            expect(result).toBe(true);
        });

        it('should reject transactions with wrong category', () => {
            const transaction = {
                category_name: 'Salary',
                source_type: 'Revenue account',
            } as TransactionSplit;

            const result = (
                service as unknown as {
                    isPaycheck: (t: TransactionSplit) => boolean;
                }
            ).isPaycheck(transaction);
            expect(result).toBe(false);
        });

        it('should reject transactions with wrong source type', () => {
            const transaction = {
                category_name: 'Paycheck',
                source_type: 'Asset account',
            } as TransactionSplit;

            const result = (
                service as unknown as {
                    isPaycheck: (t: TransactionSplit) => boolean;
                }
            ).isPaycheck(transaction);
            expect(result).toBe(false);
        });
    });
});
