import { BillComparisonService } from '../../src/services/bill-comparison.service.js';
import { BillService } from '../../src/services/core/bill.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { BillRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';

// Mock services
jest.mock('../../src/services/core/bill.service');
jest.mock('../../src/services/core/transaction.service');

describe('BillComparisonService', () => {
    let billComparisonService: BillComparisonService;
    let mockBillService: jest.Mocked<BillService>;
    let mockTransactionService: jest.Mocked<TransactionService>;

    const createMockBill = (
        id: string,
        name: string,
        amount_avg: string,
        frequency: string,
        skip: number = 0
    ): BillRead => ({
        type: 'bills',
        id,
        attributes: {
            name,
            active: true,
            amount_avg,
            amount_min: amount_avg,
            amount_max: amount_avg,
            repeat_freq: frequency as any,
            skip,
            currency_code: 'USD',
            currency_symbol: '$',
        },
    });

    const createMockTransaction = (
        description: string,
        amount: string,
        bill_id: string
    ): TransactionSplit => ({
        transaction_journal_id: '1',
        description,
        amount,
        type: 'withdrawal',
        date: '2024-10-15',
        source_id: 'source1',
        destination_id: 'dest1',
        currency_code: 'USD',
        bill_id,
    });

    beforeEach(() => {
        mockBillService = {
            getActiveBills: jest.fn(),
            getBills: jest.fn(),
            getBill: jest.fn(),
        } as unknown as jest.Mocked<BillService>;

        mockTransactionService = {
            getTransactionsForMonth:
                jest.fn<(month: number, year: number) => Promise<TransactionSplit[]>>(),
        } as unknown as jest.Mocked<TransactionService>;

        billComparisonService = new BillComparisonService(mockBillService, mockTransactionService);
    });

    describe('calculateBillComparison', () => {
        it('should calculate comparison with multiple bills', async () => {
            const mockBills = [
                createMockBill('1', 'Rent', '2000', 'monthly'),
                createMockBill('2', 'Internet', '100', 'monthly'),
            ];

            const mockTransactions = [
                createMockTransaction('Rent Payment', '2000.00', '1'),
                createMockTransaction('Internet Payment', '100.00', '2'),
            ];

            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.predictedMonthlyAverage).toBe(2100);
            expect(result.actualMonthlyTotal).toBe(2100);
            expect(result.variance).toBe(0);
            expect(result.bills).toHaveLength(2);
        });

        it('should handle empty bills gracefully', async () => {
            mockBillService.getActiveBills.mockResolvedValue([]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.predictedMonthlyAverage).toBe(0);
            expect(result.actualMonthlyTotal).toBe(0);
            expect(result.variance).toBe(0);
            expect(result.bills).toEqual([]);
        });

        it('should validate month and year', async () => {
            await expect(billComparisonService.calculateBillComparison(0, 2024)).rejects.toThrow();
            await expect(billComparisonService.calculateBillComparison(13, 2024)).rejects.toThrow();
        });

        it('should calculate variance correctly', async () => {
            const mockBills = [createMockBill('1', 'Subscription', '50', 'monthly')];
            const mockTransactions = [createMockTransaction('Subscription Payment', '60.00', '1')];

            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.predictedMonthlyAverage).toBe(50);
            expect(result.actualMonthlyTotal).toBe(60);
            expect(result.variance).toBe(10); // actual - predicted
        });

        it('should handle bills with different frequencies', async () => {
            const mockBills = [
                createMockBill('1', 'Monthly', '100', 'monthly'),
                createMockBill('2', 'Yearly', '1200', 'yearly'), // 100/month
                createMockBill('3', 'Quarterly', '300', 'quarterly'), // 100/month
            ];

            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.predictedMonthlyAverage).toBe(300); // 100 + 100 + 100
        });

        it('should handle bills with skip values', async () => {
            const mockBills = [
                createMockBill('1', 'Bi-weekly', '130', 'weekly', 1), // 130 * 52 / 2 / 12 = 281.67
                createMockBill('2', 'Bi-monthly', '80', 'monthly', 1), // 80 / 2 = 40
            ];

            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.predictedMonthlyAverage).toBeCloseTo(321.67, 2); // 281.67 + 40
        });

        it('should map transactions to bills correctly', async () => {
            const mockBills = [
                createMockBill('1', 'Bill A', '100', 'monthly'),
                createMockBill('2', 'Bill B', '200', 'monthly'),
            ];

            const mockTransactions = [
                createMockTransaction('Payment A', '105.00', '1'),
                createMockTransaction('Payment B1', '100.00', '2'),
                createMockTransaction('Payment B2', '100.00', '2'),
            ];

            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            const billA = result.bills.find(b => b.id === '1');
            const billB = result.bills.find(b => b.id === '2');

            expect(billA?.actual).toBe(105);
            expect(billB?.actual).toBe(200); // 100 + 100
        });

        it('should handle transactions without bill_id', async () => {
            const mockBills = [createMockBill('1', 'Bill A', '100', 'monthly')];
            const unbilledTransaction: TransactionSplit = {
                ...createMockTransaction('Unbilled', '50.00', ''),
                bill_id: null,
            };

            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([unbilledTransaction]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.actualMonthlyTotal).toBe(0); // Unbilled transaction not counted
        });

        it('should handle currency fallbacks', async () => {
            const billWithoutCurrency: BillRead = {
                type: 'bills',
                id: '1',
                attributes: {
                    name: 'Bill',
                    active: true,
                    amount_avg: '100',
                    amount_min: '100',
                    amount_max: '100',
                    repeat_freq: 'monthly',
                    // No currency fields
                },
            };

            mockBillService.getActiveBills.mockResolvedValue([billWithoutCurrency]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.currencyCode).toBe('USD');
            expect(result.currencySymbol).toBe('$');
        });

        it('should handle bills with subscription_id instead of bill_id', async () => {
            const mockBills = [createMockBill('1', 'Subscription', '50', 'monthly')];
            const transactionWithSubscriptionId: TransactionSplit = {
                ...createMockTransaction('Sub Payment', '50.00', ''),
                bill_id: null,
                subscription_id: '1',
            };

            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                transactionWithSubscriptionId,
            ]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.actualMonthlyTotal).toBe(50);
        });

        it('should handle invalid bill amounts gracefully', async () => {
            const invalidBill: BillRead = {
                type: 'bills',
                id: '1',
                attributes: {
                    name: 'Invalid Bill',
                    active: true,
                    amount_avg: 'invalid',
                    amount_min: 'also invalid',
                    amount_max: 'still invalid',
                    repeat_freq: 'monthly',
                },
            };

            mockBillService.getActiveBills.mockResolvedValue([invalidBill]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.predictedMonthlyAverage).toBe(0); // Invalid amount defaults to 0
        });

        it('should handle negative bill amounts gracefully', async () => {
            const negativeBill: BillRead = {
                type: 'bills',
                id: '1',
                attributes: {
                    name: 'Negative Bill',
                    active: true,
                    amount_avg: '-100',
                    amount_min: '-100',
                    amount_max: '-100',
                    repeat_freq: 'monthly',
                },
            };

            mockBillService.getActiveBills.mockResolvedValue([negativeBill]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.predictedMonthlyAverage).toBe(0); // Negative amount defaults to 0
        });

        it('should handle errors from bill service', async () => {
            mockBillService.getActiveBills.mockRejectedValue(new Error('API Error'));

            await expect(billComparisonService.calculateBillComparison(10, 2024)).rejects.toThrow(
                'Failed to calculate bill comparison for month 10'
            );
        });

        it('should handle errors from transaction service', async () => {
            const mockBills = [createMockBill('1', 'Test Bill', '100', 'monthly')];
            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('Transaction Error')
            );

            await expect(billComparisonService.calculateBillComparison(10, 2024)).rejects.toThrow(
                'Failed to calculate bill comparison for month 10'
            );
        });
    });

    describe('prorateToMonthly', () => {
        it('should prorate weekly bills correctly', async () => {
            const mockBills = [createMockBill('1', 'Weekly', '52', 'weekly')];
            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            // 52 * 52 / 12 = 225.33...
            expect(result.predictedMonthlyAverage).toBeCloseTo(225.33, 2);
        });

        it('should prorate quarterly bills correctly', async () => {
            const mockBills = [createMockBill('1', 'Quarterly', '300', 'quarterly')];
            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.predictedMonthlyAverage).toBe(100); // 300 / 3
        });

        it('should prorate half-year bills correctly', async () => {
            const mockBills = [createMockBill('1', 'Half-Year', '600', 'half-year')];
            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.predictedMonthlyAverage).toBe(100); // 600 / 6
        });

        it('should handle skip parameter with weekly bills', async () => {
            const mockBills = [createMockBill('1', 'Bi-weekly', '100', 'weekly', 1)];
            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            // 100 * 52 / 2 / 12 = 216.67
            expect(result.predictedMonthlyAverage).toBeCloseTo(216.67, 2);
        });

        it('should handle skip parameter with monthly bills', async () => {
            const mockBills = [createMockBill('1', 'Bi-monthly', '100', 'monthly', 1)];
            mockBillService.getActiveBills.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.predictedMonthlyAverage).toBe(50); // 100 / 2
        });
    });
});
