import { BudgetDisplayService } from '../../../src/services/display/budget-display.service.js';
import { BudgetReportDto } from '../../../src/types/dto/budget-report.dto.js';
import { BillComparisonDto } from '../../../src/types/dto/bill-comparison.dto.js';
import { jest } from '@jest/globals';

// Mock chalk to return the input string (disable styling for tests)
jest.mock('chalk', () => ({
    default: {
        red: (str: string) => str,
        green: (str: string) => str,
        gray: (str: string) => str,
        cyan: (str: string) => str,
        bold: (str: string) => str,
    },
}));

describe('BudgetDisplayService', () => {
    let service: BudgetDisplayService;

    beforeEach(() => {
        service = new BudgetDisplayService();
    });

    describe('formatReport - Bills Section', () => {
        it('should show top 4 bills when verbose=false', () => {
            const mockBill = (name: string, actual: number, predicted: number) => ({
                id: name.replace(/\s/g, '_'),
                name,
                actual,
                predicted,
                frequency: 'monthly' as const,
            });

            const billComparison: BillComparisonDto = {
                predictedTotal: 2000,
                actualTotal: 1950,
                variance: -50,
                bills: [
                    mockBill('Electric', 120, 115),
                    mockBill('Internet', 89.99, 89.99),
                    mockBill('Water', 45, 40),
                    mockBill('Phone', 75, 75),
                    mockBill('Gym', 50, 50),
                    mockBill('Streaming', 45, 50),
                ],
                currencySymbol: '$',
                currencyCode: 'USD',
            };

            const reportData = {
                budgets: [],
                topExpenses: [],
                billComparison,
                unbudgeted: [],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = service.formatReport(reportData, false);

            // Should contain top 4 bills
            expect(result).toContain('Electric');
            expect(result).toContain('Internet');
            expect(result).toContain('Water');
            expect(result).toContain('Phone');

            // Should contain "Others" grouping
            expect(result).toContain('Others (2)');
        });

        it('should show all bills when verbose=true', () => {
            const mockBill = (name: string, actual: number, predicted: number) => ({
                id: name.replace(/\s/g, '_'),
                name,
                actual,
                predicted,
                frequency: 'monthly' as const,
            });

            const billComparison: BillComparisonDto = {
                predictedTotal: 2000,
                actualTotal: 1950,
                variance: -50,
                bills: [
                    mockBill('Electric', 120, 115),
                    mockBill('Internet', 89.99, 89.99),
                    mockBill('Water', 45, 40),
                    mockBill('Phone', 75, 75),
                    mockBill('Gym', 50, 50),
                    mockBill('Streaming', 45, 50),
                ],
                currencySymbol: '$',
                currencyCode: 'USD',
            };

            const reportData = {
                budgets: [],
                topExpenses: [],
                billComparison,
                unbudgeted: [],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = service.formatReport(reportData, true);

            // Should contain all bills
            expect(result).toContain('Electric');
            expect(result).toContain('Internet');
            expect(result).toContain('Water');
            expect(result).toContain('Phone');
            expect(result).toContain('Gym');
            expect(result).toContain('Streaming');

            // Should NOT contain "Others" grouping in verbose mode
            expect(result).not.toContain('Others (2)');
        });

        it('should not show Others grouping when fewer than 5 bills', () => {
            const mockBill = (name: string, actual: number, predicted: number) => ({
                id: name.replace(/\s/g, '_'),
                name,
                actual,
                predicted,
                frequency: 'monthly' as const,
            });

            const billComparison: BillComparisonDto = {
                predictedTotal: 300,
                actualTotal: 290,
                variance: -10,
                bills: [
                    mockBill('Electric', 120, 115),
                    mockBill('Internet', 89.99, 89.99),
                    mockBill('Water', 45, 40),
                ],
                currencySymbol: '$',
                currencyCode: 'USD',
            };

            const reportData = {
                budgets: [],
                topExpenses: [],
                billComparison,
                unbudgeted: [],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = service.formatReport(reportData, false);

            // Should show all bills (less than 4)
            expect(result).toContain('Electric');
            expect(result).toContain('Internet');
            expect(result).toContain('Water');

            // Should NOT contain "Others" grouping
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
                    threeMonthAvg: 425,
                },
                transactionStats: {
                    count: 15,
                    average: 30,
                    topMerchant: {
                        name: 'Whole Foods',
                        visitCount: 5,
                        totalSpent: 150,
                    },
                    spendingTrend: {
                        direction: 'increasing',
                        difference: 50,
                        percentageChange: 12.5,
                    },
                },
            };

            const reportData = {
                budgets: [budget],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = service.formatReport(reportData, true);

            // Should include statistics
            expect(result).toContain('Whole Foods');
            expect(result).toContain('Increasing');
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
                    threeMonthAvg: 425,
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

            const reportData = {
                budgets: [budget],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = service.formatReport(reportData, false);

            // Should contain budget name but not detailed statistics
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
                    threeMonthAvg: 110,
                },
                transactionStats: {
                    count: 5,
                    average: 20,
                    // No topMerchant
                },
            };

            const reportData = {
                budgets: [budget],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = service.formatReport(reportData, true);

            // Should contain Avg Spending
            expect(result).toContain('Avg Spending');
            expect(result).toContain('$110');

            // Should not contain "Top Merchant" line since it's missing
            const topMerchantLine = result.split('\n').find(line => line.includes('Top Merchant'));
            expect(topMerchantLine).toBeUndefined();
        });

        it('should handle missing spendingTrend gracefully', () => {
            const budget: BudgetReportDto = {
                budgetId: 'test-1',
                name: 'Utilities',
                amount: 300,
                spent: -250,
                status: 'on-track',
                percentageUsed: 83.3,
                remaining: 50,
                historicalComparison: {
                    previousMonthSpent: 260,
                    threeMonthAvg: 255,
                },
                transactionStats: {
                    count: 3,
                    average: 83.33,
                    // No spendingTrend
                },
            };

            const reportData = {
                budgets: [budget],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = service.formatReport(reportData, true);

            // Should contain Avg Spending
            expect(result).toContain('Avg Spending');

            // Should not contain "Trend" line since it's missing
            const trendLine = result.split('\n').find(line => line.includes('Trend'));
            expect(trendLine).toBeUndefined();
        });

        it('should show decreasing trend with correct emoji', () => {
            const budget: BudgetReportDto = {
                budgetId: 'test-1',
                name: 'Dining',
                amount: 200,
                spent: -100,
                status: 'on-track',
                percentageUsed: 50,
                remaining: 100,
                historicalComparison: {
                    previousMonthSpent: 150,
                    threeMonthAvg: 125,
                },
                transactionStats: {
                    count: 8,
                    average: 12.5,
                    spendingTrend: {
                        direction: 'decreasing',
                        difference: -50,
                        percentageChange: -33.3,
                    },
                },
            };

            const reportData = {
                budgets: [budget],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = service.formatReport(reportData, true);

            // Should contain decreasing trend with emoji
            expect(result).toContain('Decreasing');
            expect(result).toContain('vs last month');
        });

        it('should show stable trend with correct emoji', () => {
            const budget: BudgetReportDto = {
                budgetId: 'test-1',
                name: 'Subscriptions',
                amount: 100,
                spent: -95,
                status: 'on-track',
                percentageUsed: 95,
                remaining: 5,
                historicalComparison: {
                    previousMonthSpent: 95,
                    threeMonthAvg: 95,
                },
                transactionStats: {
                    count: 5,
                    average: 19,
                    spendingTrend: {
                        direction: 'stable',
                        difference: 0,
                        percentageChange: 0,
                    },
                },
            };

            const reportData = {
                budgets: [budget],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = service.formatReport(reportData, true);

            // Should contain stable trend
            expect(result).toContain('Stable');
        });
    });

    describe('formatReport - Footer Tip', () => {
        it('should mention verbose flag in footer', () => {
            const reportData = {
                budgets: [],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = service.formatReport(reportData, false);

            // Should mention verbose or -v flag
            expect(result).toMatch(/--verbose|--v|-v/);
        });
    });

    describe('formatReport - Unbudgeted Transactions', () => {
        it('should truncate descriptions longer than 60 characters without ellipsis', () => {
            const baseUrl = 'http://firefly.local';
            const serviceWithUrl = new BudgetDisplayService(baseUrl);

            const longDesc = 'A'.repeat(80);
            const mockTransaction = {
                transaction_journal_id: 'txn-123',
                description: longDesc,
                amount: '-55.99',
                date: '2025-04-12',
                currency_symbol: '$',
            };

            const reportData = {
                budgets: [],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [
                    {
                        transaction: mockTransaction,
                        categoryEmoji: '📊',
                    },
                ],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = serviceWithUrl.formatReport(reportData, false);

            // Find the line with this transaction
            const lines = result.split('\n');
            const transactionLine = lines.find(line => line.includes('📊'));

            expect(transactionLine).toBeDefined();

            // Should contain first 60 chars of description
            expect(transactionLine).toContain('A'.repeat(60));
            // Should not contain chars beyond 60
            expect(transactionLine).not.toContain('A'.repeat(61));
            // Verify no ellipsis was added
            expect(transactionLine).not.toContain('...');
        });

        it('should wrap descriptions in OSC 8 hyperlinks when baseUrl and transaction_journal_id are present', () => {
            const baseUrl = 'http://firefly.local';
            const serviceWithUrl = new BudgetDisplayService(baseUrl);

            const transactionId = 'txn-456';
            const mockTransaction = {
                transaction_journal_id: transactionId,
                description: 'Simple Transaction',
                amount: '-25.00',
                date: '2025-04-12',
                currency_symbol: '$',
            };

            const reportData = {
                budgets: [],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [
                    {
                        transaction: mockTransaction,
                        categoryEmoji: '🛒',
                    },
                ],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = serviceWithUrl.formatReport(reportData, false);

            // Should contain the expected hyperlink format (OSC 8 escape sequence)
            const expectedLink = `http://firefly.local/transactions/show/${transactionId}`;
            expect(result).toContain(`\x1B]8;;${expectedLink}\x1B\\`);
        });

        it('should not add hyperlinks when baseUrl is empty', () => {
            const serviceNoUrl = new BudgetDisplayService();

            const mockTransaction = {
                transaction_journal_id: 'txn-789',
                description: 'Test Transaction',
                amount: '-10.00',
                date: '2025-04-12',
                currency_symbol: '$',
            };

            const reportData = {
                budgets: [],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [
                    {
                        transaction: mockTransaction,
                        categoryEmoji: '📱',
                    },
                ],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = serviceNoUrl.formatReport(reportData, false);

            // Should not contain OSC 8 escape sequences
            expect(result).not.toContain('\x1B]8;;');
        });

        it('should not add hyperlinks when transaction_journal_id is undefined', () => {
            const baseUrl = 'http://firefly.local';
            const serviceWithUrl = new BudgetDisplayService(baseUrl);

            const mockTransaction = {
                transaction_journal_id: undefined,
                description: 'No ID Transaction',
                amount: '-15.00',
                date: '2025-04-12',
                currency_symbol: '$',
            };

            const reportData = {
                budgets: [],
                topExpenses: [],
                billComparison: {
                    predictedTotal: 0,
                    actualTotal: 0,
                    variance: 0,
                    bills: [],
                    currencySymbol: '$',
                    currencyCode: 'USD',
                },
                unbudgeted: [
                    {
                        transaction: mockTransaction,
                        categoryEmoji: '💳',
                    },
                ],
                insights: [],
                month: 1,
                year: 2025,
                isCurrentMonth: false,
            };

            const result = serviceWithUrl.formatReport(reportData, false);

            // Should not contain OSC 8 escape sequences since there's no transaction ID
            expect(result).not.toContain('\x1B]8;;');
        });
    });
});
