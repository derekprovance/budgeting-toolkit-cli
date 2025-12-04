import '../setup/mock-logger.js'; // Must be first to mock logger module
import { resetMockLogger } from '../setup/mock-logger.js';
import { jest } from '@jest/globals';
import { TransactionSplit, TransactionRead } from '@derekprovance/firefly-iii-sdk';
import { DisposableIncomeService } from '../../src/services/disposable-income.service.js';
import { ITransactionService } from '../../src/services/core/transaction.service.interface.js';
import { ITransactionClassificationService } from '../../src/services/core/transaction-classification.service.interface.js';
import { TransactionAnalysisErrorType } from '../../src/types/error/transaction-analysis.error.js';

describe('DisposableIncomeService', () => {
    let service: DisposableIncomeService;
    let mockTransactionService: jest.Mocked<ITransactionService>;
    let mockTransactionClassificationService: jest.Mocked<ITransactionClassificationService>;

    const createMockTransaction = (overrides: Partial<TransactionSplit> = {}): TransactionSplit =>
        ({
            description: 'Test Transaction',
            amount: '-100.00',
            date: '2024-05-15',
            currency_symbol: '$',
            category_name: 'Test Category',
            ...overrides,
        }) as TransactionSplit;

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

        service = new DisposableIncomeService(
            mockTransactionService,
            mockTransactionClassificationService
        );
    });

    describe('calculateDisposableIncome', () => {
        it('should calculate total disposable income for transactions', async () => {
            // Arrange
            const transactions = [
                createMockTransaction({ amount: '-100.00' }),
                createMockTransaction({ amount: '-50.00' }),
                createMockTransaction({ amount: '-25.50' }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);

            // Act
            const result = await service.calculateDisposableIncome(5, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(175.5);
            }

            expect(mockTransactionService.getTransactionsForMonth).toHaveBeenCalledWith(5, 2024);
        });

        it('should filter only disposable income transactions', async () => {
            // Arrange
            const transactions = [
                createMockTransaction({ amount: '-100.00' }), // Disposable income
                createMockTransaction({ amount: '-50.00' }), // Not disposable income
                createMockTransaction({ amount: '-25.00' }), // Disposable income
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome
                .mockReturnValueOnce(true) // First transaction
                .mockReturnValueOnce(false) // Second transaction
                .mockReturnValueOnce(true); // Third transaction

            // Act
            const result = await service.calculateDisposableIncome(5, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                // Only first and third transactions should be included
                expect(result.value).toBe(125.0);
            }

            expect(mockTransactionClassificationService.isDisposableIncome).toHaveBeenCalledTimes(
                3
            );
        });

        it('should use absolute values for expense amounts', async () => {
            // Arrange - disposable income transactions have negative amounts
            const transactions = [
                createMockTransaction({ amount: '-200.00' }),
                createMockTransaction({ amount: '-150.00' }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);

            // Act
            const result = await service.calculateDisposableIncome(5, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should use Math.abs() on negative amounts
                expect(result.value).toBe(350.0);
            }
        });

        it('should handle zero disposable income transactions', async () => {
            // Arrange
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(false);

            // Act
            const result = await service.calculateDisposableIncome(6, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(0);
            }
        });

        it('should handle NaN amounts and log warning', async () => {
            // Arrange
            const transactions = [
                createMockTransaction({ amount: '-100.00' }),
                createMockTransaction({ amount: 'invalid' }), // NaN
                createMockTransaction({ amount: '-50.00' }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);

            // Act
            const result = await service.calculateDisposableIncome(7, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                // NaN should be ignored
                expect(result.value).toBe(150.0);
            }
        });

        it('should handle positive amounts correctly', async () => {
            // Arrange - some transactions might have positive amounts
            const transactions = [
                createMockTransaction({ amount: '100.00' }), // Positive
                createMockTransaction({ amount: '-50.00' }), // Negative
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);

            // Act
            const result = await service.calculateDisposableIncome(8, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                // Math.abs works on both positive and negative
                expect(result.value).toBe(150.0);
            }
        });

        it('should return error for invalid month', async () => {
            // Act
            const result = await service.calculateDisposableIncome(13, 2024);

            // Assert
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe(TransactionAnalysisErrorType.INVALID_DATE);
            }

            expect(mockTransactionService.getTransactionsForMonth).not.toHaveBeenCalled();
        });

        it('should return error for invalid year', async () => {
            // Act
            const result = await service.calculateDisposableIncome(5, -1);

            // Assert
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe(TransactionAnalysisErrorType.INVALID_DATE);
            }
        });

        it('should return error when getTransactionsForMonth fails', async () => {
            // Arrange
            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('API connection failed')
            );

            // Act
            const result = await service.calculateDisposableIncome(5, 2024);

            // Assert
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe(TransactionAnalysisErrorType.FETCH_FAILED);
                expect(result.error.message).toContain('API connection failed');
            }
        });

        it('should handle decimal amounts correctly', async () => {
            // Arrange
            const transactions = [
                createMockTransaction({ amount: '-123.45' }),
                createMockTransaction({ amount: '-67.89' }),
                createMockTransaction({ amount: '-10.11' }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);

            // Act
            const result = await service.calculateDisposableIncome(9, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(201.45);
            }
        });

        it('should handle large amounts correctly', async () => {
            // Arrange
            const transactions = [
                createMockTransaction({ amount: '-5000.00' }),
                createMockTransaction({ amount: '-3500.50' }),
                createMockTransaction({ amount: '-1250.25' }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);

            // Act
            const result = await service.calculateDisposableIncome(10, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(9750.75);
            }
        });

        it('should handle zero amount transactions', async () => {
            // Arrange
            const transactions = [
                createMockTransaction({ amount: '-100.00' }),
                createMockTransaction({ amount: '0.00' }), // Zero
                createMockTransaction({ amount: '-50.00' }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);

            // Act
            const result = await service.calculateDisposableIncome(11, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(150.0);
            }
        });

        it('should call isDisposableIncome for each transaction', async () => {
            // Arrange
            const transactions = [
                createMockTransaction({ description: 'Transaction 1' }),
                createMockTransaction({ description: 'Transaction 2' }),
                createMockTransaction({ description: 'Transaction 3' }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(false);

            // Act
            await service.calculateDisposableIncome(12, 2024);

            // Assert
            expect(mockTransactionClassificationService.isDisposableIncome).toHaveBeenCalledTimes(
                3
            );
            expect(mockTransactionClassificationService.isDisposableIncome).toHaveBeenCalledWith(
                transactions[0]
            );
            expect(mockTransactionClassificationService.isDisposableIncome).toHaveBeenCalledWith(
                transactions[1]
            );
            expect(mockTransactionClassificationService.isDisposableIncome).toHaveBeenCalledWith(
                transactions[2]
            );
        });
    });
});
