import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BudgetAnalyticsService } from '../../src/services/budget-analytics.service.js';
import { BudgetReportService } from '../../src/services/budget-report.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BudgetLimitDto } from '../../src/types/dto/budget-limit.dto.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { CashFlowService } from '../../src/services/cash-flow.service.js';
import { MonthError } from '../../src/types/error/month.error.js';
import { deposit, transfer, withdrawal } from '../shared/test-data.js';
import { createMockAccountScopeService, createMockLogger, partialMock } from '../shared/mocks.js';

/** Envelope accounts: the builders' default source, and a card */
const CHECKING = 'source1';
const CARD = 'card';

type BudgetReportDto = BudgetLimitDto;
type GetReport = BudgetReportService['getBudgetReport'];
type GetTransactions = TransactionService['getTransactionsForMonth'];

describe('BudgetAnalyticsService', () => {
    let service: BudgetAnalyticsService;
    let budgetReportService: jest.Mocked<BudgetReportService>;
    let transactionService: jest.Mocked<TransactionService>;

    const mockBudget: BudgetLimitDto = {
        budgetId: 'budget-1',
        name: 'Groceries',
        amount: 500,
        spent: 200,
    };

    const base = {
        transaction_journal_id: 'trans-1',
        description: 'Walmart',
        budget_id: 'budget-1',
        currency_symbol: '$',
        date: '2024-01-15',
    };
    const mockTransaction = withdrawal('50.00', base);

    beforeEach(() => {
        jest.clearAllMocks();

        // Each test installs the methods it needs; nothing else is reachable.
        budgetReportService = partialMock<BudgetReportService>({
            getBudgetReport: jest.fn<GetReport>(),
        });
        transactionService = partialMock<TransactionService>({
            getTransactionsForMonth: jest.fn<GetTransactions>(),
        });
        // A real CashFlowService over the mocked month, so statistics and top
        // expenses see exactly the buckets the classifier produces
        service = new BudgetAnalyticsService(
            budgetReportService,
            new CashFlowService(
                transactionService,
                new TransactionClassificationService('Disposable Income', 'Paycheck'),
                createMockAccountScopeService([CHECKING, CARD]),
                createMockLogger()
            )
        );
    });

    describe('getBudgetReport', () => {
        it('should return enhanced budget report with current month data', async () => {
            const mockBudgets: BudgetReportDto[] = [mockBudget];

            budgetReportService.getBudgetReport = jest
                .fn<GetReport>()
                .mockResolvedValue({ ok: true, value: mockBudgets });

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue([mockTransaction]);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);
        });

        it('should fetch historical months data when historyMonths > 0', async () => {
            const mockBudgets: BudgetReportDto[] = [mockBudget];

            budgetReportService.getBudgetReport = jest
                .fn<GetReport>()
                .mockResolvedValue({ ok: true, value: mockBudgets });

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue([mockTransaction]);

            await service.getBudgetReport(3, 2024, 2);

            // Should be called 3 times: current month + 2 historical months
            expect(budgetReportService.getBudgetReport).toHaveBeenCalledTimes(3);
            expect(budgetReportService.getBudgetReport).toHaveBeenNthCalledWith(1, 3, 2024);
            expect(budgetReportService.getBudgetReport).toHaveBeenNthCalledWith(2, 2, 2024);
            expect(budgetReportService.getBudgetReport).toHaveBeenNthCalledWith(3, 1, 2024);
        });

        describe('historical comparison', () => {
            const spentIn = (spent: number) => ({
                ok: true as const,
                value: [{ ...mockBudget, spent }],
            });

            beforeEach(() => {
                transactionService.getTransactionsForMonth = jest
                    .fn<GetTransactions>()
                    .mockResolvedValue([]);
            });

            it('should read the three months before January from the previous year', async () => {
                budgetReportService.getBudgetReport = jest
                    .fn<GetReport>()
                    .mockResolvedValue(spentIn(100));

                await service.getBudgetReport(1, 2024, 3);

                expect(budgetReportService.getBudgetReport.mock.calls).toEqual([
                    [1, 2024],
                    [12, 2023],
                    [11, 2023],
                    [10, 2023],
                ]);
            });

            it('should average this month with every history month', async () => {
                budgetReportService.getBudgetReport = jest
                    .fn<GetReport>()
                    .mockResolvedValueOnce(spentIn(100))
                    .mockResolvedValueOnce(spentIn(200))
                    .mockResolvedValueOnce(spentIn(300))
                    .mockResolvedValueOnce(spentIn(400));

                const [row] = await service.getBudgetReport(1, 2024, 3);

                // (100 + 200 + 300 + 400) / 4
                expect(row.historicalComparison).toEqual({
                    previousMonthSpent: 200,
                    averageSpent: 250,
                });
            });

            it('should leave a history month that cannot be read out of the average', async () => {
                budgetReportService.getBudgetReport = jest
                    .fn<GetReport>()
                    .mockResolvedValueOnce(spentIn(100))
                    .mockResolvedValueOnce(spentIn(200))
                    .mockResolvedValueOnce({
                        ok: false,
                        error: { message: 'API error' } as unknown as MonthError,
                    })
                    .mockResolvedValueOnce(spentIn(400));

                const [row] = await service.getBudgetReport(1, 2024, 3);

                // (100 + 200 + 400) / 3; the failed month is not a month of 0
                expect(row.historicalComparison.previousMonthSpent).toBe(200);
                expect(row.historicalComparison.averageSpent).toBeCloseTo(233.33, 2);
            });
        });

        it('should throw error when budget report service fails', async () => {
            budgetReportService.getBudgetReport = jest.fn<GetReport>().mockResolvedValue({
                ok: false,
                error: { message: 'API error', userMessage: 'Failed' } as unknown as MonthError,
            });

            await expect(service.getBudgetReport(1, 2024, 0)).rejects.toThrow('API error');
        });

        it('should keep the failed result as the cause when bucketing fails', async () => {
            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockRejectedValue(new Error('Firefly down'));

            await expect(service.getTopExpenses(1, 2024, 5)).rejects.toMatchObject({
                message: expect.stringContaining('Firefly down'),
                cause: expect.objectContaining({ month: 1, year: 2024 }),
            });
        });

        it('should calculate percentage used correctly', async () => {
            const budgetWithData: BudgetReportDto = {
                ...mockBudget,
                spent: 300, // 60% of 500
            };

            budgetReportService.getBudgetReport = jest
                .fn<GetReport>()
                .mockResolvedValue({ ok: true, value: [budgetWithData] });

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue([mockTransaction]);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result[0].percentageUsed).toBe(60);
        });

        it('should not mark a budget with no limit as over', async () => {
            // BudgetReportService sets amount 0 when no budgetLimit matches the
            // month. There is no limit to exceed, so spending against it is not
            // "over budget".
            const noLimit: BudgetReportDto = {
                ...mockBudget,
                amount: 0,
                spent: 120,
            };

            budgetReportService.getBudgetReport = jest
                .fn<GetReport>()
                .mockResolvedValue({ ok: true, value: [noLimit] });

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue([mockTransaction]);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result[0].percentageUsed).toBe(0);
            expect(result[0].status).not.toBe('over');
        });

        it('should not count a net refund as spending', async () => {
            // Firefly reports difference_float POSITIVE for a budget whose
            // refunds outran its outflows, which BudgetReportService negates to
            // a negative `spent`; a refund must not count as spending.
            const refunded: BudgetReportDto = {
                ...mockBudget,
                amount: 500,
                spent: -50, // refunds exceeded outflows by 50
            };

            budgetReportService.getBudgetReport = jest
                .fn<GetReport>()
                .mockResolvedValue({ ok: true, value: [refunded] });

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue([mockTransaction]);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result[0].percentageUsed).toBe(-10);
            expect(result[0].status).not.toBe('over');
            // The whole limit is available, plus the refund
            expect(result[0].remaining).toBe(550);
        });

        it('should mark budget as over when spent exceeds amount', async () => {
            const overBudget: BudgetReportDto = {
                ...mockBudget,
                spent: 600, // Over 500 budget
            };

            budgetReportService.getBudgetReport = jest
                .fn<GetReport>()
                .mockResolvedValue({ ok: true, value: [overBudget] });

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue([mockTransaction]);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result[0].status).toBe('over');
        });

        it('should calculate remaining budget amount', async () => {
            budgetReportService.getBudgetReport = jest
                .fn<GetReport>()
                .mockResolvedValue({ ok: true, value: [mockBudget] });

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue([mockTransaction]);

            const result = await service.getBudgetReport(1, 2024, 0);

            // amount (500) - spent (200) = 300
            expect(result[0].remaining).toBe(300);
        });
    });

    describe('top merchant selection', () => {
        const txn = (description: string, amount: string) =>
            withdrawal(amount, {
                transaction_journal_id: `t-${description}`,
                description,
                budget_id: 'budget-1',
                currency_symbol: '$',
                date: '2024-01-15',
            });

        it('should break a visit-count tie on amount spent', async () => {
            // Every merchant visited once is the common case for a category.
            // Without a tie-break the winner is whichever happened to be
            // enumerated first -- a $5 corner-shop run standing in for a
            // category dominated by a $678 charge.
            budgetReportService.getBudgetReport = jest
                .fn<GetReport>()
                .mockResolvedValue({ ok: true, value: [mockBudget] });

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue([
                    txn('VENMO PAYMENT', '5.00'),
                    txn('AMAZON MKTPL', '400.00'),
                    txn('CORNER STORE', '3.25'),
                ]);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result[0].transactionStats.topMerchant?.name).toBe('AMAZON MKTPL');
        });

        it('should still prefer more visits over a larger single charge', async () => {
            budgetReportService.getBudgetReport = jest
                .fn<GetReport>()
                .mockResolvedValue({ ok: true, value: [mockBudget] });

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue([
                    txn('BIG ONE OFF', '900.00'),
                    { ...txn('GROCERY MART', '20.00'), transaction_journal_id: 'ks-1' },
                    { ...txn('GROCERY MART', '25.00'), transaction_journal_id: 'ks-2' },
                ]);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result[0].transactionStats.topMerchant?.name).toBe('GROCERY MART');
            expect(result[0].transactionStats.topMerchant?.visitCount).toBe(2);
        });
    });

    describe('getTopExpenses', () => {
        it('should return top expenses sorted by amount descending', async () => {
            const transactions: TransactionSplit[] = [
                withdrawal('50.00', { ...base, description: 'Walmart' }),
                withdrawal('25.00', { ...base, description: 'Gas Station' }),
                withdrawal('100.00', { ...base, description: 'Restaurant' }),
                withdrawal('10.00', { ...base, description: 'Coffee' }),
            ];

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue(transactions);

            const result = await service.getTopExpenses(1, 2024, 3);

            expect(result).toHaveLength(3);
            expect(result[0].amount).toBe(100); // Highest
            expect(result[0].description).toBe('Restaurant');
            expect(result[1].amount).toBe(50);
            expect(result[2].amount).toBe(25);
        });

        it('should keep envelope spending and drop income, refunds and card payments', async () => {
            // Amounts are unsigned, so an `amount < 0` filter would match
            // nothing and this section would never render
            const transactions: TransactionSplit[] = [
                withdrawal('50.00', { ...base, description: 'Expense' }),
                deposit('100.00', { ...base, destination_id: CHECKING, description: 'Income' }),
                transfer('75.00', { ...base, destination_id: CARD, description: 'Card payment' }),
                withdrawal('25.00', { ...base, description: 'Another Expense' }),
            ];

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue(transactions);

            const result = await service.getTopExpenses(1, 2024, 10);

            expect(result).toHaveLength(2);
            expect(result.map(e => e.description)).toEqual(['Expense', 'Another Expense']);
            expect(result.every(e => e.amount > 0)).toBe(true);
        });

        it('[R-DISP-1] should leave out purchases the disposable pool pays for', async () => {
            const transactions: TransactionSplit[] = [
                withdrawal('900.00', {
                    ...base,
                    tags: ['Disposable Income'],
                    description: 'Concert',
                }),
                withdrawal('50.00', { ...base, description: 'Groceries' }),
            ];

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue(transactions);

            const result = await service.getTopExpenses(1, 2024, 10);

            expect(result.map(e => e.description)).toEqual(['Groceries']);
        });

        it('[R-XFER-3] [R-SCOPE-2] should include money leaving the envelope and nothing from outside it', async () => {
            const transactions: TransactionSplit[] = [
                transfer('200.00', {
                    ...base,
                    destination_id: 'savings',
                    description: 'Extra to savings',
                }),
                withdrawal('1000.00', {
                    ...base,
                    source_id: 'brokerage',
                    description: 'Fund purchase',
                }),
            ];

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue(transactions);

            const result = await service.getTopExpenses(1, 2024, 10);

            expect(result.map(e => e.description)).toEqual(['Extra to savings']);
        });

        it('should return empty array when no expenses exist', async () => {
            const transactions: TransactionSplit[] = [
                deposit('100.00', { ...base, description: 'Income' }),
                deposit('50.00', { ...base, description: 'More Income' }),
            ];

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue(transactions);

            const result = await service.getTopExpenses(1, 2024, 5);

            expect(result).toHaveLength(0);
        });

        it('should respect the limit parameter', async () => {
            const transactions: TransactionSplit[] = [
                withdrawal('10.00', { ...base, description: 'Exp1' }),
                withdrawal('20.00', { ...base, description: 'Exp2' }),
                withdrawal('30.00', { ...base, description: 'Exp3' }),
                withdrawal('40.00', { ...base, description: 'Exp4' }),
                withdrawal('50.00', { ...base, description: 'Exp5' }),
            ];

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue(transactions);

            const result = await service.getTopExpenses(1, 2024, 2);

            expect(result).toHaveLength(2);
            expect(result[0].amount).toBe(50);
            expect(result[1].amount).toBe(40);
        });

        it('should use default limit of 5 when not provided', async () => {
            const transactions: TransactionSplit[] = Array.from({ length: 10 }, (_, i) =>
                withdrawal((i + 1) * 10, { ...base, description: `Expense ${i + 1}` })
            );

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue(transactions);

            const result = await service.getTopExpenses(1, 2024, 5);

            expect(result).toHaveLength(5);
        });

        it('should include budget name for each expense', async () => {
            const transactions: TransactionSplit[] = [
                withdrawal('50.00', { ...base, budget_name: 'Groceries' }),
            ];

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue(transactions);

            const result = await service.getTopExpenses(1, 2024, 1);

            expect(result[0].budgetName).toBe('Groceries');
        });

        it('should label a transaction with no budget explicitly', async () => {
            const transactions: TransactionSplit[] = [
                withdrawal('50.00', { ...base, budget_name: null }),
            ];

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue(transactions);

            const result = await service.getTopExpenses(1, 2024, 1);

            // Not "Unbudgeted" -- the report has a section by that name meaning
            // something narrower, and a bill would carry this label while never
            // appearing in it
            expect(result[0].budgetName).toBe('no budget');
        });

        it('should throw error when transaction service fails', async () => {
            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockRejectedValue(new Error('Fetch failed'));

            await expect(service.getTopExpenses(1, 2024, 5)).rejects.toThrow('Fetch failed');
        });

        it('should include date and transaction ID in results', async () => {
            const transactions: TransactionSplit[] = [
                withdrawal('50.00', {
                    ...base,
                    date: '2024-01-20',
                    transaction_journal_id: 'journal-123',
                }),
            ];

            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue(transactions);

            const result = await service.getTopExpenses(1, 2024, 1);

            expect(result[0].date).toBe('2024-01-20');
            expect(result[0].transactionId).toBe('journal-123');
        });

        it("should show Firefly's own calendar day, ignoring the offset", async () => {
            transactionService.getTransactionsForMonth = jest
                .fn<GetTransactions>()
                .mockResolvedValue([
                    withdrawal('50.00', { ...base, date: '2024-01-31T23:30:00-05:00' }),
                ]);

            const [expense] = await service.getTopExpenses(1, 2024, 1);

            expect(expense.date).toBe('2024-01-31');
        });
    });
});
