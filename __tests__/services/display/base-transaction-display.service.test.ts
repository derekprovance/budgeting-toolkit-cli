import '../../../__tests__/setup/mock-logger';
import { BaseTransactionDisplayService } from '../../../src/services/display/base-transaction-display.service.js';
import { TransactionClassificationService } from '../../../src/services/core/transaction-classification.service.js';
import { createMockTransaction } from '../../shared/test-data.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionUtils } from '../../../src/utils/transaction.utils.interface.js';
import { jest } from '@jest/globals';

describe('BaseTransactionDisplayService', () => {
    let service: BaseTransactionDisplayService;
    let mockTransactionClassificationService: jest.Mocked<TransactionClassificationService>;
    let mockTransactionUtils: ITransactionUtils;

    beforeEach(() => {
        jest.clearAllMocks();

        mockTransactionClassificationService = {
            isBill: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isTransfer: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isDeposit: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isPaycheck: jest.fn(),
            isDisposableIncome: jest.fn<(transaction: TransactionSplit) => boolean>(),
        } as unknown as jest.Mocked<TransactionClassificationService>;

        mockTransactionUtils = {
            calculateTotal: jest.fn().mockReturnValue(0),
        };

        service = new BaseTransactionDisplayService(
            mockTransactionClassificationService,
            mockTransactionUtils
        );
    });

    describe('listTransactionsWithHeader', () => {
        it('should display message when no transactions found', () => {
            const result = service.listTransactionsWithHeader([], 'Test Header');

            expect(result).toContain('Test Header');
            expect(result).toContain('No transactions found');
        });

        it('should display transactions with header', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Walmart',
                    amount: '100.00',
                    date: '2025-01-15T00:00:00Z',
                    currency_symbol: '$',
                    category_name: 'Groceries',
                }),
            ];

            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(100);

            const result = service.listTransactionsWithHeader(transactions, 'My Transactions');

            expect(result).toContain('My Transactions');
            expect(result).toContain('Walmart');
            expect(result).toContain('Groceries');
            expect(result).toContain('Total Expenses: $100.00');
        });

        it('should display multiple transactions', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Walmart',
                    amount: '100.00',
                    date: '2025-01-15T00:00:00Z',
                    currency_symbol: '$',
                }),
                createMockTransaction({
                    description: 'Target',
                    amount: '50.00',
                    date: '2025-01-16T00:00:00Z',
                    currency_symbol: '$',
                }),
            ];

            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(150);

            const result = service.listTransactionsWithHeader(
                transactions,
                'Shopping Transactions'
            );

            expect(result).toContain('Walmart');
            expect(result).toContain('Target');
            expect(result).toContain('Total Expenses: $150.00');
        });

        it('should calculate total using TransactionUtils', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '100.00', currency_symbol: '$' }),
                createMockTransaction({ amount: '50.00', currency_symbol: '$' }),
            ];

            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(150);

            service.listTransactionsWithHeader(transactions, 'Test');

            expect(mockTransactionUtils.calculateTotal).toHaveBeenCalledWith(transactions);
        });

        it('should use currency symbol from first transaction', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '100.00', currency_symbol: '€' }),
            ];

            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(100);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            expect(result).toContain('Total Expenses: €100.00');
        });

        it('should format transaction dates correctly', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Test',
                    amount: '100.00',
                    date: '2025-01-15T10:30:00Z',
                    currency_symbol: '$',
                }),
            ];

            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(100);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            // Date should be formatted as locale date string
            const expectedDate = new Date('2025-01-15T10:30:00Z').toLocaleDateString();
            expect(result).toContain(expectedDate);
        });

        it('should handle transactions without category', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Test',
                    amount: '100.00',
                    currency_symbol: '$',
                    category_name: null,
                }),
            ];

            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(100);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            // Should not contain "Category:" line
            expect(result).not.toContain('Category:');
        });

        it('should display category when present', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Test',
                    amount: '100.00',
                    currency_symbol: '$',
                    category_name: 'Groceries',
                }),
            ];

            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(100);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            expect(result).toContain('Category: Groceries');
        });
    });

    describe('transaction type indicators', () => {
        let transaction: TransactionSplit;

        beforeEach(() => {
            transaction = createMockTransaction({
                description: 'Test Transaction',
                amount: '100.00',
                currency_symbol: '$',
                date: '2025-01-15',
            });
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(100);
        });

        it('should display [BILL] indicator for bill transactions', () => {
            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(true);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);

            const result = service.listTransactionsWithHeader([transaction], 'Test');

            expect(result).toContain('[BILL]');
        });

        it('should display [TRANSFER] indicator for transfer transactions', () => {
            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(true);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);

            const result = service.listTransactionsWithHeader([transaction], 'Test');

            expect(result).toContain('[TRANSFER]');
        });

        it('should display [DEPOSIT] indicator for deposit transactions', () => {
            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(true);

            const result = service.listTransactionsWithHeader([transaction], 'Test');

            expect(result).toContain('[DEPOSIT]');
        });

        it('should display [OTHER] indicator for other transactions', () => {
            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);

            const result = service.listTransactionsWithHeader([transaction], 'Test');

            expect(result).toContain('[OTHER]');
        });

        it('should prioritize [BILL] over other types', () => {
            // Bill should be checked first
            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(true);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(true);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(true);

            const result = service.listTransactionsWithHeader([transaction], 'Test');

            expect(result).toContain('[BILL]');
            expect(result).not.toContain('[TRANSFER]');
            expect(result).not.toContain('[DEPOSIT]');
        });

        it('should prioritize [TRANSFER] over [DEPOSIT]', () => {
            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(true);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(true);

            const result = service.listTransactionsWithHeader([transaction], 'Test');

            expect(result).toContain('[TRANSFER]');
            expect(result).not.toContain('[DEPOSIT]');
        });
    });

    describe('amount formatting', () => {
        beforeEach(() => {
            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);
        });

        it('should handle negative amounts (use absolute value)', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Refund',
                    amount: '-50.00',
                    currency_symbol: '$',
                    date: '2025-01-15',
                }),
            ];
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(-50);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            // Amount should be displayed as absolute value
            expect(result).toContain('Amount: $50.00');
        });

        it('should format amounts with two decimal places', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Test',
                    amount: '123.456',
                    currency_symbol: '$',
                    date: '2025-01-15',
                }),
            ];
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(123.456);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            expect(result).toContain('Amount: $123.46');
        });

        it('should handle zero amounts', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Zero Amount',
                    amount: '0.00',
                    currency_symbol: '$',
                    date: '2025-01-15',
                }),
            ];
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(0);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            expect(result).toContain('Amount: $0.00');
        });

        it('should handle large amounts', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Large Purchase',
                    amount: '9999999.99',
                    currency_symbol: '$',
                    date: '2025-01-15',
                }),
            ];
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(9999999.99);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            expect(result).toContain('Amount: $9999999.99');
        });
    });

    describe('edge cases', () => {
        beforeEach(() => {
            (mockTransactionClassificationService.isBill as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isTransfer as jest.Mock).mockReturnValue(false);
            (mockTransactionClassificationService.isDeposit as jest.Mock).mockReturnValue(false);
        });

        it('should handle transactions with special characters in description', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Café & Bakery - "Special" Items (50% off)',
                    amount: '25.00',
                    currency_symbol: '$',
                    date: '2025-01-15',
                }),
            ];
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(25);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            expect(result).toContain('Café & Bakery - "Special" Items (50% off)');
        });

        it('should handle very long descriptions', () => {
            const longDescription = 'A'.repeat(200);
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: longDescription,
                    amount: '100.00',
                    currency_symbol: '$',
                    date: '2025-01-15',
                }),
            ];
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(100);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            expect(result).toContain(longDescription);
        });

        it('should handle empty description', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: '',
                    amount: '100.00',
                    currency_symbol: '$',
                    date: '2025-01-15',
                }),
            ];
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(100);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            // Should still display the transaction
            expect(result).toContain('Amount: $100.00');
        });

        it('should handle undefined currency symbol', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({
                    description: 'Test',
                    amount: '100.00',
                    currency_symbol: undefined as any,
                    date: '2025-01-15',
                }),
            ];
            (mockTransactionUtils.calculateTotal as jest.Mock).mockReturnValue(100);

            const result = service.listTransactionsWithHeader(transactions, 'Test');

            expect(result).toContain('Amount: undefined100.00');
            expect(result).toContain('Total Expenses: undefined100.00');
        });
    });
});
