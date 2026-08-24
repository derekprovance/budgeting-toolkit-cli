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
        bill_id: string,
        budget_id?: string
    ): TransactionSplit =>
        ({
            transaction_journal_id: '1',
            description,
            amount,
            type: 'withdrawal',
            date: '2024-10-15',
            source_id: 'source1',
            destination_id: 'dest1',
            currency_code: 'USD',
            bill_id,
            ...(budget_id ? { budget_id } : {}),
        }) as TransactionSplit;

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
            isDeposit: jest.fn(),
            isWithdrawal: jest.fn((t: TransactionSplit) => t.type === 'withdrawal'),
            hasACategory: jest.fn(),
            hasBudget: jest.fn((t: TransactionSplit) => !!t.budget_id),
        } as unknown as jest.Mocked<ITransactionClassificationService>;

        billComparisonService = new BillComparisonService(
            mockBillService,
            mockTransactionService,
            mockTransactionClassificationService
        );
    });

    describe('bills due more than once in a month', () => {
        const withPayDates = (id: string, name: string, amount: string, payDates: string[]) =>
            ({
                type: 'bills',
                id,
                attributes: {
                    name,
                    active: true,
                    amount_avg: amount,
                    amount_min: amount,
                    amount_max: amount,
                    repeat_freq: 'weekly',
                    skip: 1,
                    currency_code: 'USD',
                    currency_symbol: '$',
                    pay_dates: payDates,
                },
            }) as unknown as BillRead;

        it('should predict one payment per due date', async () => {
            // A fortnightly bill falls due twice in a long month. Predicting a
            // single payment understates the month by its whole amount.
            mockBillService.getBillsForMonth.mockResolvedValue([
                withPayDates('1', 'Fortnightly', '130', ['2024-10-14', '2024-10-28']),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.predictedTotal).toBe(260);
                expect(result.value.bills[0].predicted).toBe(260);
            }
        });

        it('should count only the due dates inside the requested month', async () => {
            mockBillService.getBillsForMonth.mockResolvedValue([
                withPayDates('1', 'Fortnightly', '130', [
                    '2024-10-28',
                    '2024-11-11', // next month
                ]),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.predictedTotal).toBe(130);
            }
        });

        // "Upcoming" is relative to now, so these use a month that is always
        // in the future rather than freezing a clock.
        const FUTURE_YEAR = new Date().getFullYear() + 5;

        it('should record the next still-future due date while nothing is paid', async () => {
            mockBillService.getBillsForMonth.mockResolvedValue([
                withPayDates('1', 'Fortnightly', '130', [
                    `${FUTURE_YEAR}-10-14`,
                    `${FUTURE_YEAR}-10-28`,
                ]),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, FUTURE_YEAR);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.bills[0].dueDate?.toISOString()).toContain(
                    `${FUTURE_YEAR}-10-14`
                );
                // both occurrences still ahead
                expect(result.value.bills[0].upcomingAmount).toBe(260);
            }
        });

        it('should not treat a past due date as upcoming', async () => {
            // A bill past its date and unpaid is not "not yet due" -- it is
            // simply unpaid, and judging it normally is the honest reading.
            mockBillService.getBillsForMonth.mockResolvedValue([
                withPayDates('1', 'Fortnightly', '130', ['2024-10-14']),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.bills[0].dueDate).toBeUndefined();
                expect(result.value.bills[0].upcomingAmount).toBe(0);
            }
        });

        it('should count only the occurrences still ahead', async () => {
            // Half behind, half ahead: only the remaining half is "not yet due".
            mockBillService.getBillsForMonth.mockResolvedValue([
                withPayDates('1', 'Fortnightly', '130', [
                    '2024-10-14', // past
                    `${FUTURE_YEAR}-10-28`, // ahead, but outside the queried month
                ]),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // only the October 2024 date counts toward the month at all
                expect(result.value.bills[0].predicted).toBe(130);
                expect(result.value.bills[0].upcomingAmount).toBe(0);
            }
        });

        it('should drop the due date once a payment lands', async () => {
            // With a real actual to judge, the row no longer needs to explain
            // itself as merely upcoming.
            mockBillService.getBillsForMonth.mockResolvedValue([
                withPayDates('1', 'Fortnightly', '130', [`${FUTURE_YEAR}-10-14`]),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                createMockTransaction('Payment', '130.00', '1'),
            ]);

            const result = await billComparisonService.calculateBillComparison(10, FUTURE_YEAR);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.bills[0].dueDate).toBeUndefined();
                expect(result.value.bills[0].upcomingAmount).toBe(0);
            }
        });
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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
            mockBillService.getBillsForMonth.mockResolvedValue([]);
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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
                // A bill that neither falls due nor sees activity gets no row
                // at all -- "$0.00 (expected $0.00)" tells the reader nothing
                expect(yearlyBill).toBeUndefined();
                expect(quarterlyBill).toBeUndefined();
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue([billWithoutCurrency]);
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue([invalidBill]);
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

            mockBillService.getBillsForMonth.mockResolvedValue([negativeBill]);
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

            mockBillService.getBillsForMonth.mockResolvedValue([billWithoutAverage]);
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
            mockBillService.getBillsForMonth.mockRejectedValue(new Error('API Error'));

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
            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue([
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
                expect(result.value.bills.find(b => b.id === '2')).toBeUndefined();
            }
        });

        it('should return false when pay_dates is empty', async () => {
            const mockBills = [createMockBill('1', 'Not Due Bill', '100', 'monthly', 0, false)];
            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue([billWithoutPayDates]);
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should remain 0 (no fallback logic needed)
                expect(result.value.predictedTotal).toBe(0);
                expect(result.value.actualTotal).toBe(0);

                // No due date and no activity: no row rather than an empty one
                expect(result.value.bills.find(b => b.id === '1')).toBeUndefined();
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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
                expect(notDueBill).toBeUndefined();
            }
        });

        it('should use fallback logic even when actual amount differs from bill amount', async () => {
            // Bill with empty pay_dates
            const mockBills = [
                createMockBill('1', 'Partially Paid Bill', '100', 'monthly', 0, false),
            ];

            // Partial payment
            const mockTransactions = [createMockTransaction('Partial Payment', '50.00', '1')];

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

            mockBillService.getBillsForMonth.mockResolvedValue(mockBills);
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

    describe('budget overlap reporting', () => {
        it('should report counted bill transactions that also carry a budget', async () => {
            const mockTransactions = [
                createMockTransaction('Rent Payment', '2000.00', '1'),
                createMockTransaction('LeetCode', '39.00', '2', 'budget-9'),
            ];

            mockBillService.getBillsForMonth.mockResolvedValue([
                createMockBill('1', 'Rent', '2000', 'monthly', 0, true),
                createMockBill('2', 'LeetCode', '39', 'monthly', 0, true),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(mockTransactions);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                // Firefly's server-side budgetSpent counts this one too, so the
                // analyze report needs it to avoid subtracting twice
                expect(result.value.budgetedTransactions).toHaveLength(1);
                expect(result.value.budgetedTransactions?.[0].description).toBe('LeetCode');
                expect(result.value.budgetedTransactions?.[0].amount).toBe('39.00');
            }
        });

        it('should report nothing when no bill carries a budget', async () => {
            mockBillService.getBillsForMonth.mockResolvedValue([
                createMockBill('1', 'Rent', '2000', 'monthly', 0, true),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                createMockTransaction('Rent Payment', '2000.00', '1'),
            ]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.budgetedTransactions).toEqual([]);
            }
        });
    });

    describe('direction and orphaned bills', () => {
        it('should let a refund reduce what a bill actually cost', async () => {
            // Firefly reports amount unsigned, so a deposit linked to a bill
            // would inflate the bill total if summed by magnitude
            mockBillService.getBillsForMonth.mockResolvedValue([
                createMockBill('1', 'Internet', '100', 'monthly'),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                { amount: '100.00', type: 'withdrawal', bill_id: '1' },
                { amount: '30.00', type: 'deposit', bill_id: '1' },
            ] as never);
            mockTransactionClassificationService.isBill.mockReturnValue(true);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.actualTotal).toBe(70);
            }
        });

        it('should still count spending on a deactivated bill, predicting nothing for it', async () => {
            // Every other bucket rejects a bill-linked transaction, so without
            // this the spending would be charged nowhere at all
            const inactive = createMockBill('9', 'Cancelled Gym', '60', 'monthly');
            inactive.attributes.active = false;

            mockBillService.getBillsForMonth.mockResolvedValue([inactive]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                { amount: '60.00', type: 'withdrawal', bill_id: '9' },
            ] as never);
            mockTransactionClassificationService.isBill.mockReturnValue(true);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.actualTotal).toBe(60);
                expect(result.value.predictedTotal).toBe(0);
            }
        });

        it('should omit a deactivated bill with no activity', async () => {
            const inactive = createMockBill('9', 'Cancelled Gym', '60', 'monthly');
            inactive.attributes.active = false;

            mockBillService.getBillsForMonth.mockResolvedValue([inactive]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.bills).toEqual([]);
                expect(result.value.actualTotal).toBe(0);
            }
        });

        it('should count transactions linked to a bill missing from the bill list', async () => {
            mockBillService.getBillsForMonth.mockResolvedValue([
                createMockBill('1', 'Internet', '100', 'monthly'),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                { amount: '100.00', type: 'withdrawal', bill_id: '1' },
                { amount: '45.00', type: 'withdrawal', bill_id: '404' }, // deleted bill
            ] as never);
            mockTransactionClassificationService.isBill.mockReturnValue(true);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.actualTotal).toBe(145);
                expect(result.value.bills.map(b => b.id)).toContain('404');
            }
        });
    });
});
