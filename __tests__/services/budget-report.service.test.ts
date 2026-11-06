import { jest } from '@jest/globals';
import { BudgetLimitRead } from '@derekprovance/firefly-iii-sdk';
import { BudgetReportService } from '../../src/services/budget-report.service.js';
import { IBudgetService } from '../../src/services/core/budget.service.interface.js';
import { buckets, createMockCashFlowService } from '../shared/mocks.js';
import { budgetRead, deposit, withdrawal } from '../shared/test-data.js';

const limit = (budgetId: string, amount: string) =>
    ({ attributes: { budget_id: budgetId, amount } }) as unknown as BudgetLimitRead;

describe('BudgetReportService', () => {
    let budgetService: jest.Mocked<IBudgetService>;

    beforeEach(() => {
        budgetService = {
            getBudgets: jest
                .fn<IBudgetService['getBudgets']>()
                .mockResolvedValue([budgetRead('1', 'Groceries'), budgetRead('2', 'Dining')]),
            getBudgetLimits: jest
                .fn<IBudgetService['getBudgetLimits']>()
                .mockResolvedValue([limit('1', '400')]),
        };
    });

    it('[R-BUDGET-1] should total the budget bucket per budget, refunds included', async () => {
        const cashFlow = createMockCashFlowService(
            buckets({
                budget: [
                    withdrawal(80, { budget_id: '1' }),
                    withdrawal(120, { budget_id: '1' }),
                    deposit(20, { budget_id: '1' }),
                    withdrawal(45, { budget_id: '2' }),
                ],
            })
        );

        const result = await new BudgetReportService(budgetService, cashFlow).getBudgetReport(
            1,
            2025
        );

        expect(result.ok && result.value).toEqual([
            { budgetId: '1', name: 'Groceries', amount: 400, spent: 180 },
            // No limit this month: allocated 0, spending still reported
            { budgetId: '2', name: 'Dining', amount: 0, spent: 45 },
        ]);
    });

    it('[R-BUCKET-1] should never count a budgeted transaction another bucket claimed', async () => {
        // A bill that also carries a budget sits in the bill bucket only
        const cashFlow = createMockCashFlowService(
            buckets({ bill: [withdrawal(60, { budget_id: '1', bill_id: '7' })] })
        );

        const result = await new BudgetReportService(budgetService, cashFlow).getBudgetReport(
            1,
            2025
        );

        expect(result.ok && result.value.map(b => b.spent)).toEqual([0, 0]);
    });

    it('[R-BUDGET-1] should give an inactive budget a row only when it has spending', async () => {
        budgetService.getBudgets.mockResolvedValue([
            budgetRead('1', 'Groceries'),
            budgetRead('3', 'Old Gym', false),
            budgetRead('4', 'Retired', false),
        ]);
        const bucket = [withdrawal(80, { budget_id: '1' }), withdrawal(40, { budget_id: '3' })];
        const cashFlow = createMockCashFlowService(buckets({ budget: bucket }));

        const result = await new BudgetReportService(budgetService, cashFlow).getBudgetReport(
            1,
            2025
        );

        expect(budgetService.getBudgets).toHaveBeenCalledWith(true);
        expect(result.ok && result.value.map(b => [b.name, b.spent])).toEqual([
            ['Groceries', 80],
            ['Old Gym', 40],
        ]);
        // The rows sum to exactly what analyze charges as budget spent
        expect(result.ok && result.value.reduce((sum, b) => sum + b.spent, 0)).toBe(120);
    });

    it('should return an error when the budgets cannot be fetched', async () => {
        budgetService.getBudgets.mockRejectedValueOnce(new Error('API Error'));

        const result = await new BudgetReportService(
            budgetService,
            createMockCashFlowService()
        ).getBudgetReport(1, 2025);

        expect(result.ok).toBe(false);
    });

    it('should return an error when bucketing fails', async () => {
        const cashFlow = createMockCashFlowService();
        cashFlow.getBuckets.mockResolvedValueOnce({
            ok: false,
            error: { message: 'fetch failed', userMessage: 'nope' },
        } as never);

        const result = await new BudgetReportService(budgetService, cashFlow).getBudgetReport(
            1,
            2025
        );

        expect(!result.ok && result.error.message).toBe('fetch failed');
    });
});
