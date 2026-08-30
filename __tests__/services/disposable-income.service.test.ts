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
            type: 'withdrawal',
            source_id: null,
            destination_id: null,
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
            isDeposit: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isWithdrawal: jest
                .fn<(transaction: TransactionSplit) => boolean>()
                .mockImplementation((t: TransactionSplit) => t.type === 'withdrawal'),
            hasBudget: jest
                .fn<(transaction: TransactionSplit) => boolean>()
                .mockImplementation((t: TransactionSplit) => !!t.budget_id),
            hasACategory: jest.fn<(transaction: TransactionSplit) => boolean>(),
        } as unknown as jest.Mocked<ITransactionClassificationService>;

        service = new DisposableIncomeService(
            mockTransactionService,
            mockTransactionClassificationService
        );
    });

    describe('calculateDisposableIncome', () => {
        it('should return disposable income transactions', async () => {
            // Arrange
            const transactions = [
                createMockTransaction({ amount: '-100.00', description: 'Transaction 1' }),
                createMockTransaction({ amount: '-50.00', description: 'Transaction 2' }),
                createMockTransaction({ amount: '-25.50', description: 'Not disposable' }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);

            // Act
            const result = await service.calculateDisposableIncome(5, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.transactions.length).toBe(2);
                expect(result.value.transactions[0].description).toBe('Transaction 1');
                expect(result.value.transactions[1].description).toBe('Transaction 2');
            }

            expect(mockTransactionService.getTransactionsForMonth).toHaveBeenCalledWith(5, 2024);
        });

        it('should filter only disposable income transactions', async () => {
            // Arrange
            const transactions = [
                createMockTransaction({ amount: '-100.00', description: 'Disposable 1' }),
                createMockTransaction({ amount: '-50.00', description: 'Not disposable' }),
                createMockTransaction({ amount: '-25.00', description: 'Disposable 2' }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true);

            // Act
            const result = await service.calculateDisposableIncome(5, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.transactions.length).toBe(2);
                expect(result.value.transactions[0].description).toBe('Disposable 1');
                expect(result.value.transactions[1].description).toBe('Disposable 2');
            }

            expect(mockTransactionClassificationService.isDisposableIncome).toHaveBeenCalledTimes(
                3
            );
        });

        it('should return empty array when no disposable income transactions exist', async () => {
            // Arrange
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(false);

            // Act
            const result = await service.calculateDisposableIncome(6, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.transactions.length).toBe(0);
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

    describe('bucket disjointness and budget overlap', () => {
        it('should exclude bill-linked transactions (BillComparisonService owns those)', async () => {
            const tagged = createMockTransaction({ description: 'Coffee', amount: '10.00' });
            const taggedBill = createMockTransaction({
                description: 'Streaming bill',
                amount: '15.00',
                bill_id: '7',
            });

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([tagged, taggedBill]);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);
            mockTransactionClassificationService.isBill.mockImplementation(
                (t: TransactionSplit) => !!t.bill_id
            );

            const result = await service.calculateDisposableIncome(5, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.transactions).toHaveLength(1);
                expect(result.value.transactions[0].description).toBe('Coffee');
            }
        });

        it('should report counted transactions that also carry a budget', async () => {
            const plain = createMockTransaction({ description: 'Coffee', amount: '10.00' });
            const budgeted = createMockTransaction({
                description: 'Dinner',
                amount: '40.00',
                budget_id: 'budget-1',
            });

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([plain, budgeted]);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);
            mockTransactionClassificationService.isBill.mockReturnValue(false);

            const result = await service.calculateDisposableIncome(5, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Firefly's budgetSpent already counts the budgeted one
                expect(result.value.budgetedTransactions).toHaveLength(1);
                expect(result.value.budgetedTransactions[0].description).toBe('Dinner');
                expect(result.value.budgetedTransactions[0].amount).toBe('40.00');
            }
        });
    });

    describe('transaction direction', () => {
        it('should let a refund reduce disposable spending rather than inflate it', async () => {
            const transactions = [
                { amount: '100.00', type: 'withdrawal', tags: ['Disposable Income'] },
                { amount: '25.00', type: 'deposit', tags: ['Disposable Income'] },
            ] as never;

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);
            mockTransactionClassificationService.isBill.mockReturnValue(false);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);

            const result = await service.calculateDisposableIncome(1, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.balance).toBe(75);
            }
        });
    });

    describe('pool movement is ignored', () => {
        // Funding a disposable pool and drawing from it to settle a tagged
        // purchase are both movements between accounts the owner already holds.
        // Neither is spending, so neither may touch the total. An earlier
        // version deducted the draws, which drove the total to zero on exactly
        // the months the workflow was followed -- and since tagged transactions
        // carry no budget, that spending was then charged to no bucket at all.
        it('should ignore a tagged transfer entirely', () => {
            const spend = { amount: '100.00', type: 'withdrawal', tags: ['Disposable Income'] };
            const transferOut = {
                amount: '40.00',
                type: 'transfer',
                tags: ['Disposable Income'],
                source_id: '39',
                destination_id: '1',
            };

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                spend,
                transferOut,
            ] as never);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);
            mockTransactionClassificationService.isBill.mockReturnValue(false);
            mockTransactionClassificationService.isTransfer.mockImplementation(
                (t: TransactionSplit) => t.type === 'transfer'
            );

            return service.calculateDisposableIncome(5, 2024).then(result => {
                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value.balance).toBe(100);
                    expect(result.value.transactions).toHaveLength(1);
                }
            });
        });

        it('should net a tagged refund against tagged spending', () => {
            const spend = { amount: '100.00', type: 'withdrawal', tags: ['Disposable Income'] };
            const refund = { amount: '40.00', type: 'deposit', tags: ['Disposable Income'] };

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                spend,
                refund,
            ] as never);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);
            mockTransactionClassificationService.isBill.mockReturnValue(false);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);

            return service.calculateDisposableIncome(5, 2024).then(result => {
                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value.balance).toBe(60);
                }
            });
        });

        it('should not floor a net-negative month at zero', () => {
            // Refunds exceeding spending is a real outcome, not an error.
            const refund = { amount: '250.00', type: 'deposit', tags: ['Disposable Income'] };

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([refund] as never);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);
            mockTransactionClassificationService.isBill.mockReturnValue(false);
            mockTransactionClassificationService.isTransfer.mockReturnValue(false);

            return service.calculateDisposableIncome(5, 2024).then(result => {
                expect(result.ok).toBe(true);
                if (result.ok) {
                    expect(result.value.balance).toBe(-250);
                }
            });
        });
    });
});
