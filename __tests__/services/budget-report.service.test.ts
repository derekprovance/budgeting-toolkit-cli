import { BudgetReportService } from '../../src/services/budget-report.service.js';
import { BudgetService } from '../../src/services/core/budget.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { BudgetLimitDto } from '../../src/types/dto/budget-limit.dto.js';
import {
    BudgetRead,
    BudgetLimitRead,
    InsightGroup,
    TransactionSplit,
} from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';

jest.mock('../../src/services/core/budget.service');
jest.mock('../../src/services/core/transaction-classification.service');

describe('BudgetReportService', () => {
    let budgetReportService: BudgetReportService;
    let mockBudgetService: jest.Mocked<BudgetService>;
    let mockTransactionClassificationService: jest.Mocked<TransactionClassificationService>;
    let mockExcludedTransactionService: {
        isExcludedTransaction: jest.Mock<(d: string, a: string) => boolean>;
    };

    beforeEach(() => {
        mockBudgetService = {
            getBudgets: jest.fn(),
            getBudgetLimits: jest.fn(),
            getBudgetExpenseInsights: jest.fn(),
            getTransactionsWithoutBudget: jest.fn(),
        } as unknown as jest.Mocked<BudgetService>;

        mockTransactionClassificationService = {
            isBill: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isDisposableIncome: jest.fn<(transaction: TransactionSplit) => boolean>(),
        } as unknown as jest.Mocked<TransactionClassificationService>;

        mockExcludedTransactionService = {
            isExcludedTransaction: jest
                .fn<(d: string, a: string) => boolean>()
                .mockReturnValue(false),
        };

        budgetReportService = new BudgetReportService(
            mockBudgetService,
            mockTransactionClassificationService,
            mockExcludedTransactionService as never
        );
    });

    describe('getBudgetReport', () => {
        it('should return budget report for all budgets', async () => {
            const mockBudgets: BudgetRead[] = [
                {
                    id: '1',
                    attributes: { name: 'Budget 1' },
                },
                {
                    id: '2',
                    attributes: { name: 'Budget 2' },
                },
            ] as BudgetRead[];

            const mockLimits: BudgetLimitRead[] = [
                {
                    id: '1',
                    attributes: { budget_id: '1', amount: '100.00' },
                },
                {
                    id: '2',
                    attributes: { budget_id: '2', amount: '200.00' },
                },
            ] as BudgetLimitRead[];

            const mockInsights = [
                {
                    id: '1',
                    difference_float: 50.0,
                },
                {
                    id: '2',
                    difference_float: 150.0,
                },
            ] as unknown as InsightGroup;

            mockBudgetService.getBudgets.mockResolvedValueOnce(mockBudgets);
            mockBudgetService.getBudgetLimits.mockResolvedValueOnce(mockLimits);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValueOnce(mockInsights);

            const result = await budgetReportService.getBudgetReport(1, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toHaveLength(2);
                expect(result.value[0]).toEqual({
                    budgetId: '1',
                    name: 'Budget 1',
                    amount: 100.0,
                    spent: 50.0,
                } as BudgetLimitDto);
                expect(result.value[1]).toEqual({
                    budgetId: '2',
                    name: 'Budget 2',
                    amount: 200.0,
                    spent: 150.0,
                } as BudgetLimitDto);
            }
        });

        it('should handle budgets with no limits or insights', async () => {
            const mockBudgets: BudgetRead[] = [
                {
                    id: '1',
                    attributes: { name: 'Budget 1' },
                },
            ] as BudgetRead[];

            mockBudgetService.getBudgets.mockResolvedValueOnce(mockBudgets);
            mockBudgetService.getBudgetLimits.mockResolvedValueOnce([]);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValueOnce(
                [] as unknown as InsightGroup
            );

            const result = await budgetReportService.getBudgetReport(1, 2024);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toHaveLength(1);
                expect(result.value[0]).toEqual({
                    budgetId: '1',
                    name: 'Budget 1',
                    amount: 0.0,
                    spent: 0.0,
                } as BudgetLimitDto);
            }
        });

        it('should return error when API call fails', async () => {
            mockBudgetService.getBudgets.mockRejectedValueOnce(new Error('API Error'));

            const result = await budgetReportService.getBudgetReport(1, 2024);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain(
                    'Budget calculation failed for getBudgetReport on month 1'
                );
            }
        });

        it('should validate month and year', async () => {
            const result1 = await budgetReportService.getBudgetReport(0, 2024);
            expect(result1.ok).toBe(false);

            const result2 = await budgetReportService.getBudgetReport(13, 2024);
            expect(result2.ok).toBe(false);
        });
    });

    describe('getUntrackedTransactions', () => {
        const split = (id: string, description: string, amount = '10.00') =>
            ({
                transaction_journal_id: id,
                description,
                amount,
                type: 'withdrawal',
            }) as unknown as TransactionSplit;

        beforeEach(() => {
            mockTransactionClassificationService.isBill.mockReturnValue(false);
            mockTransactionClassificationService.isDisposableIncome.mockReturnValue(false);
        });

        it('should exclude spending the unbudgeted bucket already charges', async () => {
            // The unbudgeted bucket feeds netImpact, so those transactions are
            // tracked — listing them as "fell through the cracks" is wrong
            const charged = split('1', 'Coffee');
            const orphan = split('2', 'BROKERAGE BUY INVESTMENT', '300.00');
            mockBudgetService.getTransactionsWithoutBudget.mockResolvedValue([charged, orphan]);

            const result = await budgetReportService.getUntrackedTransactions(8, 2026, [charged]);

            expect(result.map(t => t.transaction_journal_id)).toEqual(['2']);
        });

        it('should exclude bills and disposable income', async () => {
            const bill = split('1', 'Rent');
            const disposable = split('2', 'Dinner');
            const orphan = split('3', 'Investment');
            mockBudgetService.getTransactionsWithoutBudget.mockResolvedValue([
                bill,
                disposable,
                orphan,
            ]);
            mockTransactionClassificationService.isBill.mockImplementation(
                (t: TransactionSplit) => t.transaction_journal_id === '1'
            );
            mockTransactionClassificationService.isDisposableIncome.mockImplementation(
                (t: TransactionSplit) => t.transaction_journal_id === '2'
            );

            const result = await budgetReportService.getUntrackedTransactions(8, 2026, []);

            expect(result.map(t => t.transaction_journal_id)).toEqual(['3']);
        });

        it('should apply the global exclusion list', async () => {
            // This endpoint bypasses TransactionService, which is where the
            // exclusion list is normally applied
            const excluded = split('1', 'STOCK INVESTMENT');
            const kept = split('2', 'Something else');
            mockBudgetService.getTransactionsWithoutBudget.mockResolvedValue([excluded, kept]);
            mockExcludedTransactionService.isExcludedTransaction.mockImplementation(
                (description: string) => description === 'STOCK INVESTMENT'
            );

            const result = await budgetReportService.getUntrackedTransactions(8, 2026, []);

            expect(result.map(t => t.transaction_journal_id)).toEqual(['2']);
        });

        it('should return everything untracked when the unbudgeted bucket is empty', async () => {
            const orphan = split('1', 'BROKERAGE BUY INVESTMENT', '300.00');
            mockBudgetService.getTransactionsWithoutBudget.mockResolvedValue([orphan]);

            const result = await budgetReportService.getUntrackedTransactions(8, 2026, []);

            expect(result).toHaveLength(1);
        });
    });
});
