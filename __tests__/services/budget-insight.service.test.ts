import { describe, it, expect } from '@jest/globals';
import { BudgetInsightService } from '../../src/services/budget-insight.service.js';
import { EnhancedBudgetReportDto } from '../../src/types/dto/enhanced-budget-report.dto.js';
import { BillComparisonDto } from '../../src/types/dto/bill-comparison.dto.js';

describe('BudgetInsightService', () => {
    let service: BudgetInsightService;

    const mockBillComparison: BillComparisonDto = {
        predictedTotal: 1000,
        actualTotal: 1000,
        variance: 0,
        bills: [],
        currencyCode: 'USD',
        currencySymbol: '$',
    };

    beforeEach(() => {
        service = new BudgetInsightService();
    });

    describe('generateInsights', () => {
        it('should generate warning for over-budget categories', () => {
            const budgets: EnhancedBudgetReportDto[] = [
                {
                    budgetId: 'budget-1',
                    budgetName: 'Groceries',
                    name: 'Groceries',
                    amount: 500,
                    spent: -600,
                    status: 'over',
                    percentageUsed: 120,
                    remaining: -100,
                    currencyCode: 'USD',
                    currencySymbol: '$',
                } as any,
            ];

            const insights = service.generateInsights(budgets, mockBillComparison);

            expect(insights.length).toBeGreaterThan(0);
            const warning = insights.find(i => i.type === 'warning' && i.priority === 1);
            expect(warning).toBeDefined();
            expect(warning?.message).toContain('Groceries');
            expect(warning?.message).toContain('20%');
        });

        it('should identify highest overspend when multiple budgets are over', () => {
            const budgets: EnhancedBudgetReportDto[] = [
                {
                    budgetId: 'budget-1',
                    budgetName: 'Groceries',
                    name: 'Groceries',
                    amount: 500,
                    spent: -600,
                    status: 'over',
                    percentageUsed: 120,
                    remaining: -100,
                    currencyCode: 'USD',
                    currencySymbol: '$',
                } as any,
                {
                    budgetId: 'budget-2',
                    budgetName: 'Dining',
                    name: 'Dining',
                    amount: 300,
                    spent: -450,
                    status: 'over',
                    percentageUsed: 150,
                    remaining: -150,
                    currencyCode: 'USD',
                    currencySymbol: '$',
                } as any,
            ];

            const insights = service.generateInsights(budgets, mockBillComparison);

            const warning = insights.find(i => i.priority === 1);
            expect(warning?.message).toContain('Dining'); // 150% is higher than 120%
            expect(warning?.relatedBudget).toBe('budget-2');
        });

        it('should generate info for high frequency transactions', () => {
            const budgets: EnhancedBudgetReportDto[] = [
                {
                    budgetId: 'budget-1',
                    budgetName: 'Groceries',
                    name: 'Groceries',
                    amount: 500,
                    spent: -300,
                    status: 'on-track',
                    percentageUsed: 60,
                    remaining: 200,
                    currencyCode: 'USD',
                    currencySymbol: '$',
                    transactionStats: {
                        count: 30, // High frequency (BUSINESS_CONSTANTS.TRANSACTIONS.HIGH_FREQUENCY_COUNT = 30)
                        average: 15,
                    },
                } as any,
            ];

            const insights = service.generateInsights(budgets, mockBillComparison);

            const infoInsight = insights.find(i => i.type === 'info');
            expect(infoInsight).toBeDefined();
            expect(infoInsight?.message).toContain('30 transactions');
            expect(infoInsight?.message).toContain('Groceries');
        });

        it('should not generate info for high frequency if spent is zero', () => {
            const budgets: EnhancedBudgetReportDto[] = [
                {
                    budgetId: 'budget-1',
                    budgetName: 'Unused',
                    name: 'Unused',
                    amount: 500,
                    spent: 0,
                    status: 'under',
                    percentageUsed: 0,
                    remaining: 500,
                    currencyCode: 'USD',
                    currencySymbol: '$',
                    transactionStats: {
                        count: 20,
                        average: 0,
                    },
                } as any,
            ];

            const insights = service.generateInsights(budgets, mockBillComparison);

            const infoInsight = insights.find(i => i.type === 'info' && i.message.includes('20'));
            expect(infoInsight).toBeUndefined();
        });

        it('should generate success for well under budget', () => {
            const budgets: EnhancedBudgetReportDto[] = [
                {
                    budgetId: 'budget-1',
                    budgetName: 'Savings',
                    name: 'Savings',
                    amount: 500,
                    spent: -50,
                    status: 'under',
                    percentageUsed: 10,
                    remaining: 450,
                    currencyCode: 'USD',
                    currencySymbol: '$',
                } as any,
            ];

            const insights = service.generateInsights(budgets, mockBillComparison);

            const success = insights.find(i => i.type === 'success');
            expect(success).toBeDefined();
            expect(success?.message).toContain('Savings');
        });

        it('should not generate success for under budget with zero spend', () => {
            const budgets: EnhancedBudgetReportDto[] = [
                {
                    budgetId: 'budget-1',
                    budgetName: 'Unused',
                    name: 'Unused',
                    amount: 500,
                    spent: 0,
                    status: 'under',
                    percentageUsed: 0,
                    remaining: 500,
                    currencyCode: 'USD',
                    currencySymbol: '$',
                } as any,
            ];

            const insights = service.generateInsights(budgets, mockBillComparison);

            const success = insights.find(i => i.type === 'success');
            expect(success).toBeUndefined();
        });

        it('should generate warning for significant bill variance', () => {
            const budgets: EnhancedBudgetReportDto[] = [];
            const billComparison: BillComparisonDto = {
                predictedTotal: 1000,
                actualTotal: 1300,
                variance: 300,
                bills: [],
                currencyCode: 'USD',
                currencySymbol: '$',
            };

            const insights = service.generateInsights(budgets, billComparison);

            const billWarning = insights.find(i => i.message.includes('Bills'));
            expect(billWarning).toBeDefined();
            expect(billWarning?.type).toBe('warning');
            expect(billWarning?.message).toContain('30%');
        });

        it('should not generate warning for positive variance', () => {
            const budgets: EnhancedBudgetReportDto[] = [];
            const billComparison: BillComparisonDto = {
                predictedTotal: 1000,
                actualTotal: 900,
                variance: -100,
                bills: [],
                currencyCode: 'USD',
                currencySymbol: '$',
            };

            const insights = service.generateInsights(budgets, billComparison);

            const billWarning = insights.find(i => i.message.includes('Bills'));
            expect(billWarning).toBeUndefined();
        });

        it('should sort insights by priority', () => {
            const budgets: EnhancedBudgetReportDto[] = [
                {
                    budgetId: 'budget-1',
                    budgetName: 'Over Budget',
                    name: 'Over Budget',
                    amount: 100,
                    spent: -150,
                    status: 'over',
                    percentageUsed: 150,
                    remaining: -50,
                    currencyCode: 'USD',
                    currencySymbol: '$',
                } as any,
                {
                    budgetId: 'budget-2',
                    budgetName: 'Under Budget',
                    name: 'Under Budget',
                    amount: 500,
                    spent: -25,
                    status: 'under',
                    percentageUsed: 5,
                    remaining: 475,
                    currencyCode: 'USD',
                    currencySymbol: '$',
                } as any,
            ];

            const insights = service.generateInsights(budgets, mockBillComparison);

            // Priority 1 (over-budget warning) should come before priority 3 (success)
            const warningIndex = insights.findIndex(i => i.priority === 1);
            const successIndex = insights.findIndex(i => i.priority === 3);

            if (warningIndex !== -1 && successIndex !== -1) {
                expect(warningIndex).toBeLessThan(successIndex);
            }
        });

        it('should handle empty budgets array', () => {
            const insights = service.generateInsights([], mockBillComparison);

            expect(Array.isArray(insights)).toBe(true);
            expect(insights.length).toBeGreaterThanOrEqual(0);
        });
    });
});
