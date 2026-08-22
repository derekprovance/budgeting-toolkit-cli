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
            mockTransactionClassificationService,
            [], // disposableIncomeAccounts - empty for existing tests
            [] // incomeDestinationAccounts - empty for existing tests
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

    describe('Transfer Deduction Logic', () => {
        it('should not deduct transfers when disposableIncomeAccounts is empty', async () => {
            // Arrange - service created with empty arrays (default)
            const transactions = [createMockTransaction({ amount: '-100.00' })];
            const transfers = [
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '1',
                    amount: '50.00',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                ...transactions,
                ...transfers,
            ]);
            mockTransactionClassificationService.isDisposableIncome
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            // Type-driven, not blanket-true: the withdrawal fixture is not a
            // transfer, and disposable spending excludes transfers
            mockTransactionClassificationService.isTransfer.mockImplementation(
                (t: TransactionSplit) => t.type === 'transfer'
            );

            // Act
            const analysisResult = await service.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.balance : NaN;

            // Assert - should only use tag-based calculation
            expect(result).toBe(100.0); // No deduction
        });

        it('should deduct qualifying transfers from disposable income balance', async () => {
            // Arrange - create service with config
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'], // disposableIncomeAccounts
                ['1'] // incomeDestinationAccounts
            );

            const transactions = [createMockTransaction({ amount: '-250.00' })];
            const transfer = createMockTransaction({
                type: 'transfer',
                source_id: '6',
                destination_id: '1',
                amount: '50.00',
            });

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                ...transactions,
                transfer,
            ]);
            mockTransactionClassificationService.isDisposableIncome
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockTransactionClassificationService.isTransfer
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.balance : NaN;

            // Assert - $250 - $50 = $200
            expect(result).toBe(200.0);
        });

        it('should not deduct transfers to non-valid destination accounts', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'],
                ['1']
            );

            const transactions = [createMockTransaction({ amount: '-100.00' })];
            const transfer = createMockTransaction({
                type: 'transfer',
                source_id: '6',
                destination_id: '99',
                amount: '50.00',
            });

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                ...transactions,
                transfer,
            ]);
            mockTransactionClassificationService.isDisposableIncome
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockTransactionClassificationService.isTransfer
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.balance : NaN;

            // Assert - No deduction because destination is not valid
            expect(result).toBe(100.0);
        });

        it('should not deduct transfers from non-disposable accounts', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'],
                ['1']
            );

            const transactions = [createMockTransaction({ amount: '-100.00' })];
            const transfer = createMockTransaction({
                type: 'transfer',
                source_id: '99',
                destination_id: '1',
                amount: '50.00',
            });

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                ...transactions,
                transfer,
            ]);
            mockTransactionClassificationService.isDisposableIncome
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockTransactionClassificationService.isTransfer
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.balance : NaN;

            // Assert - No deduction because source is not disposable account
            expect(result).toBe(100.0);
        });

        it('should return 0 when transfers exceed tagged total', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'],
                ['1']
            );

            const transactions = [createMockTransaction({ amount: '-100.00' })];
            const transfer = createMockTransaction({
                type: 'transfer',
                source_id: '6',
                destination_id: '1',
                amount: '150.00',
            });

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                ...transactions,
                transfer,
            ]);
            mockTransactionClassificationService.isDisposableIncome
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false);
            mockTransactionClassificationService.isTransfer
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.balance : NaN;

            // Assert - Math.max(0, 100 - 150) = 0
            expect(result).toBe(0);
        });

        it('should handle multiple qualifying transfers', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6', '7'],
                ['1', '2']
            );

            const transactions = [createMockTransaction({ amount: '-500.00' })];
            const transfers = [
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '1',
                    amount: '100.00',
                }),
                createMockTransaction({
                    type: 'transfer',
                    source_id: '7',
                    destination_id: '2',
                    amount: '50.00',
                }),
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '2',
                    amount: '75.00',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                ...transactions,
                ...transfers,
            ]);
            mockTransactionClassificationService.isDisposableIncome
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false);
            mockTransactionClassificationService.isTransfer
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.balance : NaN;

            // Assert - $500 - ($100 + $50 + $75) = $275
            expect(result).toBe(275.0);
        });

        it('should handle transfers with missing source or destination', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'],
                ['1']
            );

            const transactions = [createMockTransaction({ amount: '-100.00' })];
            const invalidTransfers = [
                createMockTransaction({
                    type: 'transfer',
                    source_id: null,
                    destination_id: '1',
                    amount: '50.00',
                }),
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: null,
                    amount: '25.00',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                ...transactions,
                ...invalidTransfers,
            ]);
            mockTransactionClassificationService.isDisposableIncome
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(false);
            mockTransactionClassificationService.isTransfer
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true)
                .mockReturnValueOnce(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.balance : NaN;

            // Assert - Invalid transfers should be skipped
            expect(result).toBe(100.0); // No deduction
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

    describe('transfers in analysis', () => {
        it('should return qualifying transfers when configured', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'], // disposableIncomeAccounts
                ['1'] // incomeDestinationAccounts
            );

            const transfers = [
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '1',
                    amount: '100.00',
                    description: 'Qualifying transfer 1',
                }),
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '1',
                    amount: '50.00',
                    description: 'Qualifying transfer 2',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transfers);
            mockTransactionClassificationService.isTransfer.mockReturnValue(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.transfers : [];

            // Assert
            expect(result.length).toBe(2);
            expect(result[0].description).toBe('Qualifying transfer 1');
            expect(result[1].description).toBe('Qualifying transfer 2');
            expect(mockTransactionService.getTransactionsForMonth).toHaveBeenCalledWith(5, 2024);
        });

        it('should return empty array when disposableIncomeAccounts not configured', async () => {
            // Arrange - service created with empty arrays
            const transfers = [
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '1',
                    amount: '100.00',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transfers);
            mockTransactionClassificationService.isTransfer.mockReturnValue(true);

            // Act
            const analysisResult = await service.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.transfers : [];

            // Assert - should return empty due to no config
            expect(result.length).toBe(0);
            expect(mockTransactionService.getTransactionsForMonth).toHaveBeenCalledWith(5, 2024);
        });

        it('should filter out transfers to non-valid destinations', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'],
                ['1'] // Only account 1 is valid
            );

            const transfers = [
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '1',
                    amount: '100.00',
                    description: 'Valid destination',
                }),
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '2',
                    amount: '50.00',
                    description: 'Invalid destination',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transfers);
            mockTransactionClassificationService.isTransfer.mockReturnValue(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.transfers : [];

            // Assert - only first transfer should be included
            expect(result.length).toBe(1);
            expect(result[0].description).toBe('Valid destination');
        });

        it('should filter out transfers from non-disposable accounts', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'], // Only account 6 is disposable
                ['1']
            );

            const transfers = [
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '1',
                    amount: '100.00',
                    description: 'From disposable account',
                }),
                createMockTransaction({
                    type: 'transfer',
                    source_id: '7',
                    destination_id: '1',
                    amount: '50.00',
                    description: 'From non-disposable account',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transfers);
            mockTransactionClassificationService.isTransfer.mockReturnValue(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.transfers : [];

            // Assert - only first transfer should be included
            expect(result.length).toBe(1);
            expect(result[0].description).toBe('From disposable account');
        });

        it('should handle missing source or destination IDs', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'],
                ['1']
            );

            const transfers = [
                createMockTransaction({
                    type: 'transfer',
                    source_id: null,
                    destination_id: '1',
                    amount: '50.00',
                    description: 'Missing source',
                }),
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: null,
                    amount: '50.00',
                    description: 'Missing destination',
                }),
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '1',
                    amount: '100.00',
                    description: 'Valid transfer',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transfers);
            mockTransactionClassificationService.isTransfer.mockReturnValue(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.transfers : [];

            // Assert - only valid transfer should be included
            expect(result.length).toBe(1);
            expect(result[0].description).toBe('Valid transfer');
        });

        it('should filter out non-transfer transactions', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'],
                ['1']
            );

            const transactions = [
                createMockTransaction({
                    type: 'withdrawal',
                    source_id: '6',
                    destination_id: '1',
                    amount: '50.00',
                    description: 'Withdrawal (not transfer)',
                }),
                createMockTransaction({
                    type: 'transfer',
                    source_id: '6',
                    destination_id: '1',
                    amount: '100.00',
                    description: 'Transfer',
                }),
            ];

            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);
            mockTransactionClassificationService.isTransfer
                .mockReturnValueOnce(false)
                .mockReturnValueOnce(true);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.transfers : [];

            // Assert - only transfer should be included
            expect(result.length).toBe(1);
            expect(result[0].description).toBe('Transfer');
        });

        it('should return empty array when no transfers exist', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'],
                ['1']
            );

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            // Act
            const analysisResult = await serviceWithConfig.calculateDisposableIncome(5, 2024);
            const result = analysisResult.ok ? analysisResult.value.transfers : [];

            // Assert
            expect(result.length).toBe(0);
        });

        it('should handle API errors gracefully', async () => {
            // Arrange
            const serviceWithConfig = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['6'],
                ['1']
            );

            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('API connection failed')
            );

            // Act
            const result = await serviceWithConfig.calculateDisposableIncome(5, 2024);

            // Assert
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain('API connection failed');
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

    describe('transfers are not disposable spending', () => {
        it('should not let a tagged transfer cancel out its own deduction', async () => {
            // A transfer OUT of the disposable account that also carries the
            // tag must reduce the balance once. Counting it as spending too
            // would add it and deduct it in the same breath, netting to zero.
            const spend = { amount: '100.00', type: 'withdrawal', tags: ['Disposable Income'] };
            const transferOut = {
                amount: '40.00',
                type: 'transfer',
                tags: ['Disposable Income'],
                source_id: '27',
                destination_id: '1',
            };

            const svc = new DisposableIncomeService(
                mockTransactionService,
                mockTransactionClassificationService,
                ['27'],
                ['1']
            );

            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                spend,
                transferOut,
            ] as never);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(true);
            mockTransactionClassificationService.isBill.mockReturnValue(false);
            mockTransactionClassificationService.isTransfer.mockImplementation(
                (t: TransactionSplit) => t.type === 'transfer'
            );

            const result = await svc.calculateDisposableIncome(5, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.balance).toBe(60);
            }
        });
    });
});
