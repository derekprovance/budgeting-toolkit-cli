import { jest } from '@jest/globals';
import { BudgetAnalyticsService } from '../../src/services/budget-analytics.service.js';
import { BudgetReportService } from '../../src/services/budget-report.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { BudgetService } from '../../src/services/core/budget.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BudgetLimitDto } from '../../src/types/dto/budget-limit.dto.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';

// Mock the services
jest.mock('../../src/services/budget-report.service.js');
jest.mock('../../src/services/core/transaction.service.js');
jest.mock('../../src/services/core/budget.service.js');

describe('BudgetAnalyticsService', () => {
    let service: BudgetAnalyticsService;
    let budgetReportService: jest.Mocked<BudgetReportService>;
    let transactionService: jest.Mocked<TransactionService>;
    let budgetService: jest.Mocked<BudgetService>;

    const mockBudget: BudgetLimitDto = {
        budgetId: 'budget-1',
        budgetName: 'Groceries',
        amount: 500,
        spent: -200,
        currencyCode: 'USD',
        currencySymbol: '$',
    };

    // Firefly returns amounts unsigned; direction comes from `type`
    const mockTransaction: Partial<TransactionSplit> = {
        transaction_journal_id: 'trans-1',
        description: 'Walmart',
        amount: '50.00',
        type: 'withdrawal',
        budget_id: 'budget-1',
        currency_symbol: '$',
        date: '2024-01-15',
    };

    beforeEach(() => {
        jest.clearAllMocks();

        budgetReportService = new BudgetReportService() as jest.Mocked<BudgetReportService>;
        transactionService = new TransactionService() as jest.Mocked<TransactionService>;
        budgetService = new BudgetService() as jest.Mocked<BudgetService>;

        service = new BudgetAnalyticsService(
            budgetReportService,
            budgetService,
            transactionService,
            new TransactionClassificationService('5', 'Disposable Income', 'Paycheck')
        );
    });

    describe('getBudgetReport', () => {
        it('should return enhanced budget report with current month data', async () => {
            const mockBudgets: BudgetReportDto[] = [mockBudget];

            budgetReportService.getBudgetReport = jest
                .fn()
                .mockResolvedValue({ ok: true, value: mockBudgets });

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue([mockTransaction] as any);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);
        });

        it('should fetch historical months data when historyMonths > 0', async () => {
            const mockBudgets: BudgetReportDto[] = [mockBudget];

            budgetReportService.getBudgetReport = jest
                .fn()
                .mockResolvedValue({ ok: true, value: mockBudgets });

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue([mockTransaction] as any);

            await service.getBudgetReport(3, 2024, 2);

            // Should be called 3 times: current month + 2 historical months
            expect(budgetReportService.getBudgetReport).toHaveBeenCalledTimes(3);
            expect(budgetReportService.getBudgetReport).toHaveBeenNthCalledWith(1, 3, 2024);
            expect(budgetReportService.getBudgetReport).toHaveBeenNthCalledWith(2, 2, 2024);
            expect(budgetReportService.getBudgetReport).toHaveBeenNthCalledWith(3, 1, 2024);
        });

        it('should throw error when budget report service fails', async () => {
            budgetReportService.getBudgetReport = jest.fn().mockResolvedValue({
                ok: false,
                error: { message: 'API error', userMessage: 'Failed' },
            });

            await expect(service.getBudgetReport(1, 2024, 0)).rejects.toThrow('API error');
        });

        it('should calculate percentage used correctly', async () => {
            const budgetWithData: BudgetReportDto = {
                ...mockBudget,
                spent: -300, // 60% of 500
            };

            budgetReportService.getBudgetReport = jest
                .fn()
                .mockResolvedValue({ ok: true, value: [budgetWithData] });

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue([mockTransaction] as any);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result[0].percentageUsed).toBe(60);
        });

        it('should mark budget as over when spent exceeds amount', async () => {
            const overBudget: BudgetReportDto = {
                ...mockBudget,
                spent: -600, // Over 500 budget
            };

            budgetReportService.getBudgetReport = jest
                .fn()
                .mockResolvedValue({ ok: true, value: [overBudget] });

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue([mockTransaction] as any);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result[0].status).toBe('over');
        });

        it('should calculate remaining budget amount', async () => {
            budgetReportService.getBudgetReport = jest
                .fn()
                .mockResolvedValue({ ok: true, value: [mockBudget] });

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue([mockTransaction] as any);

            const result = await service.getBudgetReport(1, 2024, 0);

            // amount (500) + spent (-200) = 300
            expect(result[0].remaining).toBe(300);
        });
    });

    describe('top merchant selection', () => {
        const txn = (description: string, amount: string) =>
            ({
                transaction_journal_id: `t-${description}`,
                description,
                amount,
                type: 'withdrawal',
                budget_id: 'budget-1',
                currency_symbol: '$',
                date: '2024-01-15',
            }) as Partial<TransactionSplit>;

        it('should break a visit-count tie on amount spent', async () => {
            // Every merchant visited once is the common case for a category.
            // Without a tie-break the winner is whichever happened to be
            // enumerated first -- a $5 corner-shop run standing in for a
            // category dominated by a $678 charge.
            budgetReportService.getBudgetReport = jest
                .fn()
                .mockResolvedValue({ ok: true, value: [mockBudget] });

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue([
                    txn('VENMO PAYMENT', '5.00'),
                    txn('AMAZON MKTPL', '678.09'),
                    txn('CORNER STORE', '3.25'),
                ] as never);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result[0].transactionStats.topMerchant?.name).toBe('AMAZON MKTPL');
        });

        it('should still prefer more visits over a larger single charge', async () => {
            budgetReportService.getBudgetReport = jest
                .fn()
                .mockResolvedValue({ ok: true, value: [mockBudget] });

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue([
                    txn('BIG ONE OFF', '900.00'),
                    { ...txn('KING SOOPERS', '20.00'), transaction_journal_id: 'ks-1' },
                    { ...txn('KING SOOPERS', '25.00'), transaction_journal_id: 'ks-2' },
                ] as never);

            const result = await service.getBudgetReport(1, 2024, 0);

            expect(result[0].transactionStats.topMerchant?.name).toBe('KING SOOPERS');
            expect(result[0].transactionStats.topMerchant?.visitCount).toBe(2);
        });
    });

    describe('getTopExpenses', () => {
        it('should return top expenses sorted by amount descending', async () => {
            const transactions: Partial<TransactionSplit>[] = [
                { ...mockTransaction, amount: '50.00', description: 'Walmart' },
                { ...mockTransaction, amount: '25.00', description: 'Gas Station' },
                { ...mockTransaction, amount: '100.00', description: 'Restaurant' },
                { ...mockTransaction, amount: '10.00', description: 'Coffee' },
            ];

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue(transactions as any);

            const result = await service.getTopExpenses(1, 2024, 3);

            expect(result).toHaveLength(3);
            expect(result[0].amount).toBe(100); // Highest
            expect(result[0].description).toBe('Restaurant');
            expect(result[1].amount).toBe(50);
            expect(result[2].amount).toBe(25);
        });

        it('should filter out deposits and transfers, keeping withdrawals', async () => {
            // Regression: amounts are all positive, so the old `amount < 0`
            // filter matched nothing and this section never rendered
            const transactions: Partial<TransactionSplit>[] = [
                { ...mockTransaction, amount: '50.00', description: 'Expense' },
                {
                    ...mockTransaction,
                    amount: '100.00',
                    type: 'deposit',
                    description: 'Income',
                },
                {
                    ...mockTransaction,
                    amount: '75.00',
                    type: 'transfer',
                    description: 'Moved money',
                },
                { ...mockTransaction, amount: '25.00', description: 'Another Expense' },
            ];

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue(transactions as any);

            const result = await service.getTopExpenses(1, 2024, 10);

            expect(result).toHaveLength(2);
            expect(result.map(e => e.description)).toEqual(['Expense', 'Another Expense']);
            expect(result.every(e => e.amount > 0)).toBe(true);
        });

        it('should return empty array when no expenses exist', async () => {
            const transactions: Partial<TransactionSplit>[] = [
                { ...mockTransaction, amount: '100.00', type: 'deposit', description: 'Income' },
                {
                    ...mockTransaction,
                    amount: '50.00',
                    type: 'deposit',
                    description: 'More Income',
                },
            ];

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue(transactions as any);

            const result = await service.getTopExpenses(1, 2024, 5);

            expect(result).toHaveLength(0);
        });

        it('should respect the limit parameter', async () => {
            const transactions: Partial<TransactionSplit>[] = [
                { ...mockTransaction, amount: '10.00', description: 'Exp1' },
                { ...mockTransaction, amount: '20.00', description: 'Exp2' },
                { ...mockTransaction, amount: '30.00', description: 'Exp3' },
                { ...mockTransaction, amount: '40.00', description: 'Exp4' },
                { ...mockTransaction, amount: '50.00', description: 'Exp5' },
            ];

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue(transactions as any);

            const result = await service.getTopExpenses(1, 2024, 2);

            expect(result).toHaveLength(2);
            expect(result[0].amount).toBe(50);
            expect(result[1].amount).toBe(40);
        });

        it('should use default limit of 5 when not provided', async () => {
            const transactions: Partial<TransactionSplit>[] = Array.from(
                { length: 10 },
                (_, i) => ({
                    ...mockTransaction,
                    amount: `-${(i + 1) * 10}.00`,
                    description: `Expense ${i + 1}`,
                })
            );

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue(transactions as any);

            const result = await service.getTopExpenses(1, 2024);

            expect(result).toHaveLength(5);
        });

        it('should include budget name for each expense', async () => {
            const transactions: Partial<TransactionSplit>[] = [
                { ...mockTransaction, amount: '50.00', budget_name: 'Groceries' },
            ];

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue(transactions as any);

            const result = await service.getTopExpenses(1, 2024, 1);

            expect(result[0].budgetName).toBe('Groceries');
        });

        it('should label a transaction with no budget explicitly', async () => {
            const transactions: Partial<TransactionSplit>[] = [
                { ...mockTransaction, amount: '50.00', budget_name: null },
            ];

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue(transactions as any);

            const result = await service.getTopExpenses(1, 2024, 1);

            // Not "Unbudgeted" -- the report has a section by that name meaning
            // something narrower, and a bill would carry this label while never
            // appearing in it
            expect(result[0].budgetName).toBe('no budget');
        });

        it('should throw error when transaction service fails', async () => {
            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockRejectedValue(new Error('Fetch failed'));

            await expect(service.getTopExpenses(1, 2024, 5)).rejects.toThrow('Fetch failed');
        });

        it('should include date and transaction ID in results', async () => {
            const transactions: Partial<TransactionSplit>[] = [
                {
                    ...mockTransaction,
                    amount: '50.00',
                    date: '2024-01-20',
                    transaction_journal_id: 'journal-123',
                },
            ];

            transactionService.getTransactionsForMonth = jest
                .fn()
                .mockResolvedValue(transactions as any);

            const result = await service.getTopExpenses(1, 2024, 1);

            expect(result[0].date).toBe('2024-01-20');
            expect(result[0].transactionId).toBe('journal-123');
        });
    });
});
