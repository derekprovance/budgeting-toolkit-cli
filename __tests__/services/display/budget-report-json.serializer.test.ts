import { TEST_DATE, deposit, withdrawal } from '../../shared/test-data.js';
import { serializeBudgetReport } from '../../../src/services/display/budget-report-json.serializer.js';
import { BudgetReportDto } from '../../../src/types/dto/budget-report.dto.js';
import { BillComparisonDto } from '../../../src/types/dto/bill-comparison.dto.js';
import { BudgetReportJson } from '../../../src/types/dto/report-json.types.js';

const budget = (overrides: Partial<BudgetReportDto>): BudgetReportDto => ({
    budgetId: 'b',
    name: 'Budget',
    amount: 0,
    spent: 0,
    status: 'under',
    percentageUsed: 0,
    remaining: 0,
    historicalComparison: { previousMonthSpent: 0, averageSpent: 0 },
    transactionStats: { count: 0, average: 0 },
    ...overrides,
});

describe('serializeBudgetReport', () => {
    const groceries = budget({
        budgetId: 'groceries',
        name: 'Groceries',
        amount: 400,
        spent: 220,
        percentageUsed: 55,
        remaining: 180,
        historicalComparison: { previousMonthSpent: 500, averageSpent: 360 },
    });
    const dining = budget({
        budgetId: 'dining',
        name: 'Dining',
        amount: 150,
        spent: 120,
        percentageUsed: 80,
        remaining: 30,
        historicalComparison: { previousMonthSpent: 0, averageSpent: 60 },
    });
    const fun = budget({
        budgetId: 'fun',
        name: 'Fun',
        amount: 50,
        spent: 60.1,
        status: 'over',
        percentageUsed: 120.19999999999999,
        remaining: -10.099999999999994,
        historicalComparison: { previousMonthSpent: 45.004, averageSpent: 52.555 },
    });

    const coffee = withdrawal(35, {
        transaction_journal_id: 'u1',
        description: 'Coffee',
        source_id: 'cc',
        destination_id: 'shop',
    });
    const refund = deposit(5, {
        transaction_journal_id: 'u2',
        description: 'Coffee refund',
        source_id: 'shop',
        destination_id: 'cc',
    });
    const input = {
        budgets: [groceries, dining, fun],
        billComparison: new BillComparisonDto(240, 290, 50, [], 'USD', '$'),
        unbudgeted: [coffee, refund],
        month: 1,
        year: 2025,
    };

    it('builds the exact document from the report data', () => {
        const expected: BudgetReportJson = {
            schemaVersion: 2,
            month: 1,
            year: 2025,
            currencySymbol: '$',
            // 220 + 120 + 60.1 over 400 + 150 + 50 = 400.1 / 600
            totals: { spent: 400.1, allocated: 600, percentageUsed: 66.68 },
            budgets: [
                {
                    id: 'groceries',
                    name: 'Groceries',
                    allocated: 400,
                    spent: 220,
                    remaining: 180,
                    percentageUsed: 55,
                    status: 'under',
                    previousMonthSpent: 500,
                    averageSpent: 360,
                },
                {
                    id: 'dining',
                    name: 'Dining',
                    allocated: 150,
                    spent: 120,
                    remaining: 30,
                    percentageUsed: 80,
                    status: 'under',
                    previousMonthSpent: 0,
                    averageSpent: 60,
                },
                {
                    id: 'fun',
                    name: 'Fun',
                    allocated: 50,
                    spent: 60.1,
                    remaining: -10.1,
                    percentageUsed: 120.2,
                    status: 'over',
                    previousMonthSpent: 45,
                    averageSpent: 52.56,
                },
            ],
            bills: { predicted: 240, actual: 290, variance: 50 },
            unbudgetedExpenses: {
                // the refund reduces the section rather than inflating it
                total: 30,
                transactions: [
                    {
                        journalId: 'u1',
                        description: 'Coffee',
                        type: 'withdrawal',
                        amount: 35,
                        date: TEST_DATE,
                        sourceId: 'cc',
                        destinationId: 'shop',
                        budgetId: null,
                        billId: null,
                    },
                    {
                        journalId: 'u2',
                        description: 'Coffee refund',
                        type: 'deposit',
                        amount: 5,
                        date: TEST_DATE,
                        sourceId: 'shop',
                        destinationId: 'cc',
                        budgetId: null,
                        billId: null,
                    },
                ],
            },
        };

        expect(serializeBudgetReport(input)).toEqual(expected);
    });

    it('reports zero percentage when nothing is allocated', () => {
        const doc = serializeBudgetReport({ ...input, budgets: [], unbudgeted: [] });
        expect(doc.totals).toEqual({ spent: 0, allocated: 0, percentageUsed: 0 });
        expect(doc.budgets).toEqual([]);
        expect(doc.unbudgetedExpenses).toEqual({ total: 0, transactions: [] });
    });
});
