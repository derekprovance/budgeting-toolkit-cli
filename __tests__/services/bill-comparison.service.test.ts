import { BillComparisonService } from '../../src/services/bill-comparison.service.js';
import { BillService } from '../../src/services/core/bill.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { CashFlowService } from '../../src/services/cash-flow.service.js';
import { BillRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';
import { createMockAccountScopeService, createMockLogger, partialMock } from '../shared/mocks.js';
import { withdrawal } from '../shared/test-data.js';

/** The envelope account every fixture here pays from */
const ENVELOPE = 'source1';

describe('BillComparisonService', () => {
    let billComparisonService: BillComparisonService;
    let mockBillService: jest.Mocked<BillService>;
    let mockTransactionService: jest.Mocked<TransactionService>;

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
            // The schedule decides what falls due; a bill that starts after
            // October 2024 has nothing due in it
            date: isDueThisMonth ? '2024-10-15' : '2025-01-15',
            currency_code: 'USD',
            currency_symbol: '$',
            // Firefly's unpaid dates for the window
            pay_dates: isDueThisMonth ? ['2024-10-15'] : [],
        },
    });

    /** A withdrawal from the envelope linked to `billId` */
    const billPayment = (description: string, amount: string, billId: string) =>
        withdrawal(amount, { description, bill_id: billId, date: '2024-10-15' });

    beforeEach(() => {
        mockBillService = partialMock<BillService>({
            getBillsForMonth: jest.fn<BillService['getBillsForMonth']>(),
        });

        mockTransactionService = partialMock<TransactionService>({
            getTransactionsForMonth:
                jest.fn<(month: number, year: number) => Promise<TransactionSplit[]>>(),
        });

        // A real CashFlowService over the mocked month, so the bill bucket is
        // exactly what the classifier puts there
        billComparisonService = new BillComparisonService(
            mockBillService,
            new CashFlowService(
                mockTransactionService,
                new TransactionClassificationService('Disposable Income', 'Paycheck'),
                createMockAccountScopeService([ENVELOPE]),
                createMockLogger()
            )
        );
    });

    describe('bills due more than once in a month', () => {
        /**
         * A fortnightly $130 bill as Firefly returns it: `date` anchors the
         * schedule, and `pay_dates` lists only the occurrences still unpaid
         * (V11), falling back to the next one outside the window.
         */
        const fortnightly = (start: string, payDates: string[]) =>
            ({
                type: 'bills',
                id: '1',
                attributes: {
                    name: 'Fortnightly',
                    active: true,
                    amount_avg: '130',
                    amount_min: '130',
                    amount_max: '130',
                    date: start,
                    repeat_freq: 'weekly',
                    skip: 1,
                    currency_code: 'USD',
                    currency_symbol: '$',
                    pay_dates: payDates,
                },
            }) as unknown as BillRead;

        const compare = async (
            bill: BillRead,
            month: number,
            year: number,
            paid: string[] = []
        ) => {
            mockBillService.getBillsForMonth.mockResolvedValue([bill]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(
                paid.map(amount => billPayment('Payment', amount, '1'))
            );
            const result = await billComparisonService.calculateBillComparison(month, year);
            if (!result.ok) throw new Error(result.error.message);
            return result.value;
        };

        // "Upcoming" is relative to today: pin today to June 2025, so October
        // of FY is still ahead and every 2024 date is past
        const FY = 2025;

        beforeEach(() => {
            jest.useFakeTimers({ now: new Date(FY, 5, 15) });
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('[R-BILL-1] should expect one payment per scheduled due date', async () => {
            const result = await compare(
                fortnightly('2024-10-14', ['2024-10-14', '2024-10-28']),
                10,
                2024
            );

            expect(result.predictedTotal).toBe(260);
        });

        it('[R-BILL-1] should keep expecting the paid occurrences Firefly drops from pay_dates', async () => {
            // Both paid: Firefly reports only the next date, in November
            const result = await compare(fortnightly('2024-10-14', ['2024-11-11']), 10, 2024, [
                '130.00',
                '130.00',
            ]);

            expect(result.bills[0]).toMatchObject({
                predicted: 260,
                actual: 260,
                upcomingAmount: 0,
            });
        });

        it('should count only the scheduled dates inside the requested month', async () => {
            const result = await compare(fortnightly('2024-10-28', ['2024-10-28']), 10, 2024);

            expect(result.predictedTotal).toBe(130);
        });

        it('should report every unpaid occurrence still ahead', async () => {
            const result = await compare(
                fortnightly(`${FY}-10-14`, [`${FY}-10-14`, `${FY}-10-28`]),
                10,
                FY
            );

            expect(result.bills[0].upcomingAmount).toBe(260);
            expect(result.bills[0].dueDate?.getDate()).toBe(14);
        });

        it('should report only the unpaid half of a partly-settled bill', async () => {
            // First paid: Firefly now lists only the 28th
            const result = await compare(fortnightly(`${FY}-10-14`, [`${FY}-10-28`]), 10, FY, [
                '130.00',
            ]);

            expect(result.bills[0]).toMatchObject({
                predicted: 260,
                actual: 130,
                upcomingAmount: 130,
            });
            expect(result.bills[0].dueDate?.getDate()).toBe(28);
        });

        it('should report nothing ahead once every occurrence is paid', async () => {
            const result = await compare(fortnightly(`${FY}-10-14`, [`${FY}-11-11`]), 10, FY, [
                '130.00',
                '130.00',
            ]);

            expect(result.bills[0].upcomingAmount).toBe(0);
            expect(result.bills[0].dueDate).toBeUndefined();
        });

        it('should not treat a past unpaid date as upcoming', async () => {
            // Past its date and unpaid is simply unpaid, not "not yet due"
            const result = await compare(
                fortnightly('2024-10-14', ['2024-10-14', '2024-10-28']),
                10,
                2024
            );

            expect(result.bills[0].upcomingAmount).toBe(0);
            expect(result.bills[0].dueDate).toBeUndefined();
        });

        it("should still show this month's bill as due after a late payment for last month", async () => {
            // Monthly $100 due on the 25th; September's was paid late on October 2.
            // Firefly still lists October 25 as unpaid.
            const monthly = fortnightly(`${FY}-01-25`, [`${FY}-10-25`]);
            monthly.attributes.repeat_freq = 'monthly';
            monthly.attributes.skip = 0;
            monthly.attributes.amount_avg = '100';

            const result = await compare(monthly, 10, FY, ['100.00']);

            expect(result.bills[0]).toMatchObject({
                predicted: 100,
                actual: 100,
                upcomingAmount: 100,
            });
        });
    });

    describe('calculateBillComparison', () => {
        it('should calculate comparison with multiple bills due this month', async () => {
            const mockBills = [
                createMockBill('1', 'Rent', '2000', 'monthly', 0, true),
                createMockBill('2', 'Internet', '100', 'monthly', 0, true),
            ];

            const mockTransactions = [
                billPayment('Rent Payment', '2000.00', '1'),
                billPayment('Internet Payment', '100.00', '2'),
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

        it('should calculate variance correctly', async () => {
            const mockBills = [createMockBill('1', 'Subscription', '50', 'monthly', 0, true)];
            const mockTransactions = [billPayment('Subscription Payment', '60.00', '1')];

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
                billPayment('Payment A', '105.00', '1'),
                billPayment('Payment B1', '100.00', '2'),
                billPayment('Payment B2', '100.00', '2'),
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
            const unbilledTransaction = withdrawal(50, {
                description: 'Unbilled',
                date: '2024-10-15',
            });

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
            const transactionWithSubscriptionId = withdrawal(50, {
                description: 'Sub Payment',
                date: '2024-10-15',
                subscription_id: '1',
            });

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
                    date: '2024-10-15',
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
                    'Bill comparison calculation failed for calculateBillComparison on 10/2024: API Error'
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
                expect(result.error.message).toContain('Transaction Error');
            }
        });
    });

    describe('due dates come from the schedule', () => {
        it('should only count bills scheduled in the requested month/year', async () => {
            const billDueThisMonth: BillRead = {
                type: 'bills',
                id: '1',
                attributes: {
                    name: 'Due This Month',
                    active: true,
                    amount_avg: '100',
                    amount_min: '100',
                    amount_max: '100',
                    date: '2024-10-15',
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
                    date: '2024-11-15', // starts in November
                    repeat_freq: 'monthly',
                    pay_dates: ['2024-11-15'],
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
                expect(result.value.predictedTotal).toBe(0);
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
                // Weekly from Oct 15 falls due on the 15th, 22nd and 29th:
                // 75 + 600 + 1200 = 1875
                expect(result.value.predictedTotal).toBe(1875);

                expect(result.value.bills[0].frequency).toBe('weekly');
                expect(result.value.bills[0].predicted).toBe(75);
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

    describe('account scope', () => {
        it('[R-SCOPE-2] should expect a bill paid from outside the envelope but count nothing paid', async () => {
            mockBillService.getBillsForMonth.mockResolvedValue([
                createMockBill('1', 'Starry', '50', 'monthly', 0, true),
            ]);
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                { ...billPayment('Starry', '50.00', '1'), source_id: 'pool' },
            ]);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok && result.value.actualTotal).toBe(0);
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
                { amount: '100.00', type: 'withdrawal', bill_id: '1', source_id: ENVELOPE },
                { amount: '30.00', type: 'deposit', bill_id: '1', destination_id: ENVELOPE },
            ] as never);

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
                { amount: '60.00', type: 'withdrawal', bill_id: '9', source_id: ENVELOPE },
            ] as never);

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
                { amount: '100.00', type: 'withdrawal', bill_id: '1', source_id: ENVELOPE },
                // deleted bill
                { amount: '45.00', type: 'withdrawal', bill_id: '404', source_id: ENVELOPE },
            ] as never);

            const result = await billComparisonService.calculateBillComparison(10, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.actualTotal).toBe(145);
                expect(result.value.bills.map(b => b.id)).toContain('404');
            }
        });
    });
});
