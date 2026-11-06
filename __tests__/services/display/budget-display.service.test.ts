import stripAnsi from 'strip-ansi';
import { BudgetDisplayService } from '../../../src/services/display/budget-display.service.js';
import { BudgetReportDto } from '../../../src/types/dto/budget-report.dto.js';
import { BillComparisonDto, BillDetailDto } from '../../../src/types/dto/bill-comparison.dto.js';
import { BudgetReportResult } from '../../../src/types/dto/budget-report-result.dto.js';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { deposit, withdrawal } from '../../shared/test-data.js';

// Output is plain text: FORCE_COLOR=0 (see __tests__/setup/env.ts) disables
// chalk. OSC 8 hyperlinks are emitted regardless of color support.

/** A report with nothing in it but `fields` */
const report = (fields: Partial<BudgetReportResult> = {}): BudgetReportResult => ({
    budgets: [],
    topExpenses: [],
    billComparison: BillComparisonDto.empty(),
    unbudgeted: [],
    insights: [],
    month: 1,
    year: 2025,
    ...fields,
});

/** A monthly bill with nothing still to come */
const bill = (name: string, actual: number, predicted: number) =>
    new BillDetailDto(name.replace(/\s/g, '_'), name, predicted, actual, 'monthly');

describe('BudgetDisplayService', () => {
    let service: BudgetDisplayService;

    beforeEach(() => {
        service = new BudgetDisplayService();
    });

    describe('formatReport - Bills Section', () => {
        it('should mark an upcoming bill rather than judging its variance', () => {
            // Rendering it green puts it beside genuinely cheap bills and
            // invites the reader to bank money they still owe
            const billComparison = BillComparisonDto.create(
                50,
                0,
                [
                    new BillDetailDto(
                        'starry',
                        'Starry Internet',
                        50,
                        0,
                        'monthly',
                        new Date('2099-08-27T00:00:00Z'),
                        50
                    ),
                ],
                'USD',
                '$'
            );
            const reportData = report({ billComparison, month: 8, year: 2099 });

            const billLine = stripAnsi(service.formatReport(reportData, false))
                .split('\n')
                .find(line => line.includes('Starry Internet'));

            expect(billLine).toMatch(/^⏳ /);
        });

        it('should show top 4 bills when verbose=false', () => {
            const billComparison = new BillComparisonDto(
                2000,
                1950,
                -50,
                [
                    bill('Electric', 120, 115),
                    bill('Internet', 89.99, 89.99),
                    bill('Water', 45, 40),
                    bill('Phone', 75, 75),
                    bill('Gym', 50, 50),
                    bill('Streaming', 45, 50),
                ],
                'USD',
                '$'
            );

            const reportData = report({ billComparison });

            const result = service.formatReport(reportData, false);

            expect(result).toContain('Electric');
            expect(result).toContain('Internet');
            expect(result).toContain('Phone');
            expect(result).toContain('Gym');

            expect(result).not.toContain('Water');
            expect(result).toContain('Others (2)');
        });

        it('should show all bills when verbose=true', () => {
            const billComparison = new BillComparisonDto(
                2000,
                1950,
                -50,
                [
                    bill('Electric', 120, 115),
                    bill('Internet', 89.99, 89.99),
                    bill('Water', 45, 40),
                    bill('Phone', 75, 75),
                    bill('Gym', 50, 50),
                    bill('Streaming', 45, 50),
                ],
                'USD',
                '$'
            );

            const reportData = report({ billComparison });

            const result = service.formatReport(reportData, true);

            expect(result).toContain('Electric');
            expect(result).toContain('Internet');
            expect(result).toContain('Water');
            expect(result).toContain('Phone');
            expect(result).toContain('Gym');
            expect(result).toContain('Streaming');

            expect(result).not.toContain('Others (2)');
        });

        it('should not show Others grouping when fewer than 5 bills', () => {
            const billComparison = new BillComparisonDto(
                300,
                290,
                -10,
                [bill('Electric', 120, 115), bill('Internet', 89.99, 89.99), bill('Water', 45, 40)],
                'USD',
                '$'
            );

            const reportData = report({ billComparison });

            const result = service.formatReport(reportData, false);

            expect(result).toContain('Electric');
            expect(result).toContain('Internet');
            expect(result).toContain('Water');

            expect(result).not.toContain('Others');
        });
    });

    describe('formatReport - Budget Statistics (Verbose)', () => {
        it('should include budget statistics when verbose=true and data available', () => {
            const budget: BudgetReportDto = {
                budgetId: 'test-1',
                name: 'Groceries',
                amount: 500,
                spent: -450,
                status: 'over',
                percentageUsed: 90,
                remaining: 50,
                historicalComparison: {
                    previousMonthSpent: 400,
                    averageSpent: 425,
                },
                transactionStats: {
                    count: 15,
                    average: 30,
                    topMerchant: {
                        name: 'Whole Foods',
                        visitCount: 5,
                        totalSpent: 150,
                    },
                },
            };

            const reportData = report({ budgets: [budget] });

            const result = service.formatReport(reportData, true);

            expect(result).toContain('Whole Foods');
            expect(result).toContain('Avg Spending');
            expect(result).toContain('$425');
        });

        it('should not include statistics when verbose=false', () => {
            const budget: BudgetReportDto = {
                budgetId: 'test-1',
                name: 'Groceries',
                amount: 500,
                spent: -450,
                status: 'over',
                percentageUsed: 90,
                remaining: 50,
                historicalComparison: {
                    previousMonthSpent: 400,
                    averageSpent: 425,
                },
                transactionStats: {
                    count: 15,
                    average: 30,
                    topMerchant: {
                        name: 'Whole Foods',
                        visitCount: 5,
                        totalSpent: 150,
                    },
                },
            };

            const reportData = report({ budgets: [budget] });

            const result = service.formatReport(reportData, false);

            expect(result).toContain('Groceries');
            expect(result).not.toContain('Whole Foods');
        });

        it('should handle missing topMerchant gracefully', () => {
            const budget: BudgetReportDto = {
                budgetId: 'test-1',
                name: 'Entertainment',
                amount: 200,
                spent: -100,
                status: 'on-track',
                percentageUsed: 50,
                remaining: 100,
                historicalComparison: {
                    previousMonthSpent: 120,
                    averageSpent: 110,
                },
                transactionStats: {
                    count: 5,
                    average: 20,
                    // No topMerchant
                },
            };

            const reportData = report({ budgets: [budget] });

            const result = service.formatReport(reportData, true);

            expect(result).toContain('Avg Spending');
            expect(result).toContain('$110');

            const topMerchantLine = result.split('\n').find(line => line.includes('Top Merchant'));
            expect(topMerchantLine).toBeUndefined();
        });
    });

    describe('formatReport - Footer Tip', () => {
        it('should mention verbose flag in footer', () => {
            const reportData = report();

            const result = service.formatReport(reportData, false);

            expect(result).toMatch(/--verbose|--v|-v/);
        });
    });

    describe('formatReport - Unbudgeted Transactions', () => {
        it('should truncate descriptions longer than 60 characters without ellipsis', () => {
            const baseUrl = 'http://firefly.local';
            const serviceWithUrl = new BudgetDisplayService(baseUrl);

            const longDesc = 'A'.repeat(80);
            const mockTransaction = withdrawal('55.99', {
                transaction_journal_id: 'txn-123',
                description: longDesc,
                date: '2025-04-12',
                currency_symbol: '$',
            });

            const reportData = report({ unbudgeted: [mockTransaction] });

            const result = serviceWithUrl.formatReport(reportData, false);

            const lines = result.split('\n');
            const transactionLine = lines.find(line => line.includes('📊'));

            expect(transactionLine).toBeDefined();

            expect(transactionLine).toContain('A'.repeat(60));
            expect(transactionLine).not.toContain('A'.repeat(61));
            expect(transactionLine).not.toContain('...');
        });

        it('should wrap descriptions in OSC 8 hyperlinks when baseUrl and transaction_journal_id are present', () => {
            const baseUrl = 'http://firefly.local';
            const serviceWithUrl = new BudgetDisplayService(baseUrl);

            const transactionId = 'txn-456';
            const mockTransaction = withdrawal('25.00', {
                transaction_journal_id: transactionId,
                description: 'Simple Transaction',
                date: '2025-04-12',
                currency_symbol: '$',
            });

            const reportData = report({ unbudgeted: [mockTransaction] });

            const result = serviceWithUrl.formatReport(reportData, false);

            const expectedLink = `http://firefly.local/transactions/show/${transactionId}`;
            expect(result).toContain(`\x1B]8;;${expectedLink}\x1B\\`);
        });

        it('should not add hyperlinks when baseUrl is empty', () => {
            const serviceNoUrl = new BudgetDisplayService();

            const mockTransaction = withdrawal('10.00', {
                transaction_journal_id: 'txn-789',
                description: 'Test Transaction',
                date: '2025-04-12',
                currency_symbol: '$',
            });

            const reportData = report({ unbudgeted: [mockTransaction] });

            const result = serviceNoUrl.formatReport(reportData, false);

            expect(result).not.toContain('\x1B]8;;');
        });

        it('should not add hyperlinks when transaction_journal_id is undefined', () => {
            const baseUrl = 'http://firefly.local';
            const serviceWithUrl = new BudgetDisplayService(baseUrl);

            const mockTransaction = withdrawal('15.00', {
                transaction_journal_id: undefined,
                description: 'No ID Transaction',
                date: '2025-04-12',
                currency_symbol: '$',
            });

            const reportData = report({ unbudgeted: [mockTransaction] });

            const result = serviceWithUrl.formatReport(reportData, false);

            expect(result).not.toContain('\x1B]8;;');
        });
    });

    describe('formatReport - unbudgeted section', () => {
        const builders = { withdrawal, deposit };
        const item = (
            description: string,
            amount: string,
            type: keyof typeof builders = 'withdrawal',
            category_name?: string
        ) => builders[type](amount, { description, category_name, date: '2026-08-11' });

        const baseData = () => report({ month: 8, year: 2026 });

        it('should render the unbudgeted bucket under its header', () => {
            const data = { ...baseData(), unbudgeted: [item('Coffee', '4.50')] };

            const result = service.formatReport(data, false);

            expect(result).toContain('UNBUDGETED EXPENSES');
            expect(result).toContain('Coffee');
        });

        it('should mark each row with its category emoji', () => {
            const data = {
                ...baseData(),
                unbudgeted: [item('Pharmacy', '12.00', 'withdrawal', 'Healthcare')],
            };

            const result = stripAnsi(service.formatReport(data, false));

            expect(result).toContain('🏥 Pharmacy');
        });

        it('should omit the unbudgeted section when the bucket is empty', () => {
            const result = service.formatReport(baseData(), false);

            expect(result).not.toContain('UNBUDGETED EXPENSES');
        });

        it('[R-REFUND-1] should sign a refund so the rows visibly add up', () => {
            const data = {
                ...baseData(),
                unbudgeted: [item('Hardware', '100.00'), item('Grocer Refund', '25.00', 'deposit')],
            };

            const result = stripAnsi(service.formatReport(data, false));

            expect(result).toContain('-$25.00');
            expect(result).toContain('Total: $75.00');
        });

        it('should say "no limit" rather than count spending as money left', () => {
            const data = report({
                month: 8,
                year: 2026,
                budgets: [
                    {
                        budgetId: '1',
                        name: 'NoLimit',
                        amount: 0,
                        spent: 50,
                        remaining: -50,
                        percentageUsed: 0,
                        status: 'under',
                        historicalComparison: { previousMonthSpent: 0, averageSpent: 0 },
                        transactionStats: { count: 0, average: 0 },
                    },
                ],
            });

            const result = stripAnsi(service.formatReport(data, false));

            expect(result).toContain('no limit');
            expect(result).not.toContain('$50.00 left');
        });

        it('should never render an Untracked Spending section', () => {
            // RULES.md: activity in outside accounts is not shown
            const data = { ...baseData(), unbudgeted: [item('Coffee', '4.50')] };

            const result = service.formatReport(data, false);

            expect(result).not.toContain('UNTRACKED SPENDING');
        });
    });
});
