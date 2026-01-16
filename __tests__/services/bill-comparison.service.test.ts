import { BillComparisonService } from '../../src/services/bill-comparison.service.js';
import { BillService } from '../../src/services/core/bill.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { ITransactionClassificationService } from '../../src/services/core/transaction-classification.service.interface.js';
import { BillRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';

// Mock services
jest.mock('../../src/services/core/bill.service');
jest.mock('../../src/services/core/transaction.service');

describe('BillComparisonService', () => {
    let billComparisonService: BillComparisonService;
    let mockBillService: jest.Mocked<BillService>;
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockTransactionClassificationService: jest.Mocked<ITransactionClassificationService>;

    /**
     * Creates a mock bill with pay_dates to indicate if it's due this month
     * @param isDueThisMonth - If true, pay_dates will be populated; if false, empty array
     */
    const createMockBill = (
        id: string,
        name: string,
        amount_avg: string,
        frequency: string,
        skip: number = 0,
        isDueThisMonth: boolean = true
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
            // pay_dates populated by Firefly III when date range is passed
            pay_dates: isDueThisMonth ? ['2024-10-15'] : [],
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
            getActiveBillsForMonth: jest.fn(),
            getBillsForMonth: jest.fn(),
            getBills: jest.fn(),
            getBill: jest.fn(),
        } as unknown as jest.Mocked<BillService>;

        mockTransactionService = {
            getTransactionsForMonth:
                jest.fn<(month: number, year: number) => Promise<TransactionSplit[]>>(),
        } as unknown as jest.Mocked<TransactionService>;

        mockTransactionClassificationService = {
            isBill: jest.fn((t: TransactionSplit) => !!(t.bill_id || t.subscription_id)),
            isTransfer: jest.fn(),
            isDisposableIncome: jest.fn(),
            hasNoDestination: jest.fn(),
            isSupplementedByDisposable: jest.fn(),
            isExcludedTransaction: jest.fn(),
            isDeposit: jest.fn(),
            hasACategory: jest.fn(),
        } as unknown as jest.Mocked<ITransactionClassificationService>;

        billComparisonService = new BillComparisonService(
            mockBillService,
            mockTransactionService,
            mockTransactionClassificationService
        );
    });

    describe('calculateBillComparison', () => {
        it('should calculate comparison with multiple bills due this month', async () => {
            const mockBills = [
                createMockBill('1', 'Rent', '2000', 'monthly', 0, true),
                createMockBill('2', 'Internet', '100', 'monthly', 0, true),
            ];

            const mockTransactions = [
                createMockTransaction('Rent Payment', '2000.00', '1'),
                createMockTransaction('Internet Payment', '100.00', '2'),
            ];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.predictedTotal).toBe(2100);
                expect(result.value.actualTotal).toBe(2100);
                expect(result.value.variance).toBe(0);
                expect(result.value.bills).toHaveLength(2);
            }
        });

        it('should handle empty bills gracefully', async () => {
            mockBillService.getActiveBillsForMonth.mockResolvedValue([]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.predictedTotal).toBe(0);
                expect(result.value.actualTotal).toBe(0);
                expect(result.value.variance).toBe(0);
                expect(result.value.bills).toEqual([]);
            }
        });

        it('should validate month and year', async () => {
            const result1 = await billComparisonService.calculateBillComparison(0, 2024);
            expect(result1.ok).toBe(false);

            const result2 = await billComparisonService.calculateBillComparison(13, 2024);
            expect(result2.ok).toBe(false);
        });

        it('should calculate variance correctly', async () => {
            const mockBills = [createMockBill('1', 'Subscription', '50', 'monthly', 0, true)];
            const mockTransactions = [createMockTransaction('Subscription Payment', '60.00', '1')];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.predictedTotal).toBe(50);
                expect(result.value.actualTotal).toBe(60);
                expect(result.value.variance).toBe(10); // actual - predicted
            }
        });

        it('should show full bill amounts when due, regardless of frequency', async () => {
            // All bills are due this month (pay_dates populated)
            const mockBills = [
                createMockBill('1', 'Monthly', '100', 'monthly', 0, true),
                createMockBill('2', 'Yearly', '1200', 'yearly', 0, true),
                createMockBill('3', 'Quarterly', '300', 'quarterly', 0, true),
            ];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // All three bills are due, show full amounts: 100 + 1200 + 300 = 1600
                expect(result.value.predictedTotal).toBe(1600);

                const monthlyBill = result.value.bills.find(b => b.id === '1');
                const yearlyBill = result.value.bills.find(b => b.id === '2');
                const quarterlyBill = result.value.bills.find(b => b.id === '3');

                expect(monthlyBill?.predicted).toBe(100); // Full amount when due
                expect(yearlyBill?.predicted).toBe(1200); // Full amount when due
                expect(quarterlyBill?.predicted).toBe(300); // Full amount when due
            }
        });

        it('should show zero for bills not due this month', async () => {
            // Mix of bills due and not due
            const mockBills = [
                createMockBill('1', 'Monthly Due', '100', 'monthly', 0, true),
                createMockBill('2', 'Yearly Not Due', '1200', 'yearly', 0, false),
                createMockBill('3', 'Quarterly Not Due', '300', 'quarterly', 0, false),
            ];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Only monthly bill is due
                expect(result.value.predictedTotal).toBe(100);

                // Check individual bill predictions
                const monthlyBill = result.value.bills.find(b => b.id === '1');
                const yearlyBill = result.value.bills.find(b => b.id === '2');
                const quarterlyBill = result.value.bills.find(b => b.id === '3');

                expect(monthlyBill?.predicted).toBe(100);
                expect(yearlyBill?.predicted).toBe(0);
                expect(quarterlyBill?.predicted).toBe(0);
            }
        });

        it('should map transactions to bills correctly', async () => {
            const mockBills = [
                createMockBill('1', 'Bill A', '100', 'monthly', 0, true),
                createMockBill('2', 'Bill B', '200', 'monthly', 0, true),
            ];

            const mockTransactions = [
                createMockTransaction('Payment A', '105.00', '1'),
                createMockTransaction('Payment B1', '100.00', '2'),
                createMockTransaction('Payment B2', '100.00', '2'),
            ];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                const billA = result.value.bills.find(b => b.id === '1');
                const billB = result.value.bills.find(b => b.id === '2');

                expect(billA?.actual).toBe(105);
                expect(billB?.actual).toBe(200); // 100 + 100
            }
        });

        it('should handle transactions without bill_id', async () => {
            const mockBills = [createMockBill('1', 'Bill A', '100', 'monthly', 0, true)];
            const unbilledTransaction: TransactionSplit = {
                ...createMockTransaction('Unbilled', '50.00', ''),
                bill_id: null,
            };

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([unbilledTransaction]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.actualTotal).toBe(0); // Unbilled transaction not counted
            }
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
                    pay_dates: ['2024-10-15'],
                    // No currency fields
                },
            };

            mockBillService.getActiveBillsForMonth.mockResolvedValue([billWithoutCurrency]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.currencyCode).toBe('USD');
                expect(result.value.currencySymbol).toBe('$');
            }
        });

        it('should handle bills with subscription_id instead of bill_id', async () => {
            const mockBills = [createMockBill('1', 'Subscription', '50', 'monthly', 0, true)];
            const transactionWithSubscriptionId: TransactionSplit = {
                ...createMockTransaction('Sub Payment', '50.00', ''),
                bill_id: null,
                subscription_id: '1',
            };

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                transactionWithSubscriptionId,
            ]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.actualTotal).toBe(50);
            }
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
                    pay_dates: ['2024-10-15'],
                },
            };

            mockBillService.getActiveBillsForMonth.mockResolvedValue([invalidBill]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.predictedTotal).toBe(0); // Invalid amount defaults to 0
            }
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
                    pay_dates: ['2024-10-15'],
                },
            };

            mockBillService.getActiveBillsForMonth.mockResolvedValue([negativeBill]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.predictedTotal).toBe(0); // Negative amount defaults to 0
            }
        });

        it('should use amount_min and amount_max midpoint when amount_avg is missing', async () => {
            const billWithoutAverage: BillRead = {
                type: 'bills',
                id: '1',
                attributes: {
                    name: 'Bill with Min/Max',
                    active: true,
                    // amount_avg is missing
                    amount_min: '100',
                    amount_max: '200',
                    repeat_freq: 'monthly',
                    pay_dates: ['2024-10-15'],
                },
            };

            mockBillService.getActiveBillsForMonth.mockResolvedValue([billWithoutAverage]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Midpoint of 100 and 200 is 150
                expect(result.value.predictedTotal).toBe(150);
                expect(result.value.bills[0].predicted).toBe(150);
            }
        });

        it('should handle errors from bill service', async () => {
            mockBillService.getActiveBillsForMonth.mockRejectedValue(new Error('API Error'));

            const result = await billComparisonService.calculateBillComparison(10, 2024);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain(
                    'Bill comparison calculation failed for calculateBillComparison on month 10'
                );
            }
        });

        it('should handle errors from transaction service', async () => {
            const mockBills = [createMockBill('1', 'Test Bill', '100', 'monthly', 0, true)];
            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('Transaction Error')
            );

            const result = await billComparisonService.calculateBillComparison(10, 2024);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain(
                    'Bill comparison calculation failed for calculateBillComparison on month 10'
                );
            }
        });
    });

    describe('isBillDueThisMonth', () => {
        it('should only count bills with pay_dates in the requested month/year', async () => {
            const billDueThisMonth: BillRead = {
                type: 'bills',
                id: '1',
                attributes: {
                    name: 'Due This Month',
                    active: true,
                    amount_avg: '100',
                    amount_min: '100',
                    amount_max: '100',
                    repeat_freq: 'monthly',
                    pay_dates: ['2024-10-15'], // October 2024
                    currency_code: 'USD',
                    currency_symbol: '$',
                },
            };

            const billDueNextMonth: BillRead = {
                type: 'bills',
                id: '2',
                attributes: {
                    name: 'Due Next Month',
                    active: true,
                    amount_avg: '200',
                    amount_min: '200',
                    amount_max: '200',
                    repeat_freq: 'monthly',
                    pay_dates: ['2024-11-15'], // November 2024 (not this month)
                    currency_code: 'USD',
                    currency_symbol: '$',
                },
            };

            mockBillService.getActiveBillsForMonth.mockResolvedValue([
                billDueThisMonth,
                billDueNextMonth,
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Only the bill due in October should be counted
                expect(result.value.predictedTotal).toBe(100);
                expect(result.value.bills.find(b => b.id === '1')?.predicted).toBe(100);
                expect(result.value.bills.find(b => b.id === '2')?.predicted).toBe(0);
            }
        });

        it('should return false when pay_dates is empty', async () => {
            const mockBills = [createMockBill('1', 'Not Due Bill', '100', 'monthly', 0, false)];
            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.predictedTotal).toBe(0);
            }
        });

        it('should handle bill without pay_dates field', async () => {
            const billWithoutPayDates: BillRead = {
                type: 'bills',
                id: '1',
                attributes: {
                    name: 'Bill without pay_dates',
                    active: true,
                    amount_avg: '100',
                    amount_min: '100',
                    amount_max: '100',
                    repeat_freq: 'monthly',
                    currency_code: 'USD',
                    currency_symbol: '$',
                    // No pay_dates field
                },
            };

            mockBillService.getActiveBillsForMonth.mockResolvedValue([billWithoutPayDates]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Without pay_dates, bill is considered not due
                expect(result.value.predictedTotal).toBe(0);
            }
        });
    });

    describe('Defensive logic for empty pay_dates', () => {
        it('should use fallback logic when bill has empty pay_dates but has transactions', async () => {
            // Bill with empty pay_dates (bug scenario)
            const mockBills = [createMockBill('1', 'Buggy Bill', '100', 'monthly', 0, false)];

            // But it has transactions
            const mockTransactions = [
                createMockTransaction('Payment for Buggy Bill', '100.00', '1'),
            ];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should use bill amount as predicted (fallback logic)
                expect(result.value.predictedTotal).toBe(100); // Not 0!
                expect(result.value.actualTotal).toBe(100);
                expect(result.value.variance).toBe(0);

                const buggyBill = result.value.bills.find(b => b.id === '1');
                expect(buggyBill?.predicted).toBe(100); // Used fallback logic
                expect(buggyBill?.actual).toBe(100);
            }
        });

        it('should keep predicted=0 when bill has empty pay_dates and no transactions', async () => {
            // Bill not due this month
            const mockBills = [
                createMockBill('1', 'Not Due Bill', '100', 'monthly', 0, false), // isDueThisMonth = false
            ];

            // And no transactions
            const mockTransactions: TransactionSplit[] = [];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should remain 0 (no fallback logic needed)
                expect(result.value.predictedTotal).toBe(0);
                expect(result.value.actualTotal).toBe(0);

                const notDueBill = result.value.bills.find(b => b.id === '1');
                expect(notDueBill?.predicted).toBe(0); // Stays 0
                expect(notDueBill?.actual).toBe(0);
            }
        });

        it('should handle mixed scenarios: normal due, fallback logic, and not due', async () => {
            const mockBills = [
                createMockBill('1', 'Normal Due Bill', '100', 'monthly', 0, true), // Normal: due with pay_dates
                createMockBill('2', 'Buggy Bill', '200', 'monthly', 0, false), // Bug: empty pay_dates but has transactions
                createMockBill('3', 'Not Due Bill', '300', 'monthly', 0, false), // Normal: not due, no transactions
            ];

            const mockTransactions = [
                createMockTransaction('Payment 1', '100.00', '1'), // Normal due bill
                createMockTransaction('Payment 2', '200.00', '2'), // Buggy bill with transactions
                // No transaction for bill 3
            ];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Expected: 100 (normal) + 200 (fallback) + 0 (not due) = 300
                expect(result.value.predictedTotal).toBe(300);
                expect(result.value.actualTotal).toBe(300);

                const normalBill = result.value.bills.find(b => b.id === '1');
                const buggyBill = result.value.bills.find(b => b.id === '2');
                const notDueBill = result.value.bills.find(b => b.id === '3');

                expect(normalBill?.predicted).toBe(100);
                expect(buggyBill?.predicted).toBe(200); // Fallback logic applied
                expect(notDueBill?.predicted).toBe(0);
            }
        });

        it('should use fallback logic even when actual amount differs from bill amount', async () => {
            // Bill with empty pay_dates
            const mockBills = [
                createMockBill('1', 'Partially Paid Bill', '100', 'monthly', 0, false),
            ];

            // Partial payment
            const mockTransactions = [createMockTransaction('Partial Payment', '50.00', '1')];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should use full bill amount as predicted (fallback logic)
                expect(result.value.predictedTotal).toBe(100);
                expect(result.value.actualTotal).toBe(50);
                expect(result.value.variance).toBe(-50); // Under-paid

                const bill = result.value.bills.find(b => b.id === '1');
                expect(bill?.predicted).toBe(100);
                expect(bill?.actual).toBe(50);
            }
        });

        it('should use fallback logic when bill has multiple transactions but empty pay_dates', async () => {
            const mockBills = [
                createMockBill('1', 'Bill with Multiple Payments', '200', 'monthly', 0, false),
            ];

            // Multiple payments for the same bill
            const mockTransactions = [
                createMockTransaction('Payment 1', '100.00', '1'),
                createMockTransaction('Payment 2', '100.00', '1'),
            ];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.predictedTotal).toBe(200); // Fallback logic
                expect(result.value.actualTotal).toBe(200); // Sum of both payments

                const bill = result.value.bills.find(b => b.id === '1');
                expect(bill?.predicted).toBe(200);
                expect(bill?.actual).toBe(200);
            }
        });
    });

    describe('Bill frequency information', () => {
        it('should show full amounts when bills are due, with frequency information', async () => {
            const mockBills = [
                createMockBill('1', 'Weekly Bill', '25', 'weekly', 0, true),
                createMockBill('2', 'Half-Year Bill', '600', 'half-year', 0, true),
                createMockBill('3', 'Yearly Bill', '1200', 'yearly', 0, true),
            ];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Show full amounts: 25 + 600 + 1200 = 1825
                expect(result.value.predictedTotal).toBe(1825);

                // Each bill shows the full amount and includes frequency info for display
                expect(result.value.bills[0].frequency).toBe('weekly');
                expect(result.value.bills[0].predicted).toBe(25);
                expect(result.value.bills[1].frequency).toBe('half-year');
                expect(result.value.bills[1].predicted).toBe(600);
                expect(result.value.bills[2].frequency).toBe('yearly');
                expect(result.value.bills[2].predicted).toBe(1200);
            }
        });

        it('should include frequency in bill details for information purposes', async () => {
            const mockBills = [
                createMockBill('1', 'Monthly', '100', 'monthly', 0, true),
                createMockBill('2', 'Quarterly', '300', 'quarterly', 0, true),
                createMockBill('3', 'Yearly', '1200', 'yearly', 0, true),
            ];

            mockBillService.getActiveBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.bills[0].frequency).toBe('monthly');
                expect(result.value.bills[1].frequency).toBe('quarterly');
                expect(result.value.bills[2].frequency).toBe('yearly');
            }
        });
    });
});
