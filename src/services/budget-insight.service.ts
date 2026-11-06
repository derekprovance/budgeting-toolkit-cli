import { BudgetReportDto } from '../types/dto/budget-report.dto.js';
import { BillComparisonDto } from '../types/dto/bill-comparison.dto.js';
import { BudgetInsight } from '../types/dto/budget-insight.dto.js';
import { CurrencyUtils } from '../utils/currency.utils.js';
import { BUSINESS_CONSTANTS } from '../utils/business-constants.js';

export class BudgetInsightService {
    /** @returns insights sorted by priority, lowest number first */
    generateInsights(
        budgets: BudgetReportDto[],
        billComparison: BillComparisonDto
    ): BudgetInsight[] {
        const insights: BudgetInsight[] = [];

        const overBudgets = budgets
            .filter(b => b.status === 'over')
            .sort((a, b) => b.percentageUsed - a.percentageUsed);

        if (overBudgets.length > 0) {
            const worst = overBudgets[0];
            // "% used", as the budget row shows: "1284% over" beneath "1384%"
            // reads as a contradiction
            insights.push({
                type: 'warning',
                message: `${worst.name} is your biggest issue - ${worst.percentageUsed.toFixed(0)}% of its limit`,
                priority: 1,
                relatedBudget: worst.budgetId,
            });
        }

        budgets.forEach(budget => {
            if (
                budget.transactionStats.count >=
                    BUSINESS_CONSTANTS.TRANSACTIONS.HIGH_FREQUENCY_COUNT &&
                budget.spent !== 0
            ) {
                const avgSpent = budget.spent / budget.transactionStats.count;
                const avgFormatted = CurrencyUtils.formatWithSymbol(
                    avgSpent,
                    billComparison.currencySymbol
                );
                insights.push({
                    type: 'info',
                    message: `You had ${budget.transactionStats.count} transactions in ${budget.name} (avg ${avgFormatted} each)`,
                    priority: 2,
                    relatedBudget: budget.budgetId,
                });
            }
        });

        const underBudgets = budgets
            .filter(
                b =>
                    b.status === 'under' &&
                    b.percentageUsed < BUSINESS_CONSTANTS.BUDGET.WELL_UNDER_THRESHOLD &&
                    b.spent !== 0
            )
            .sort((a, b) => a.percentageUsed - b.percentageUsed);

        if (underBudgets.length > 0) {
            const best = underBudgets[0];
            insights.push({
                type: 'success',
                message: `${best.name} looking good - stayed under budget`,
                priority: 3,
                relatedBudget: best.budgetId,
            });
        }

        // A predictedTotal of 0 would yield Infinity%
        if (billComparison.predictedTotal > 0 && billComparison.variance > 0) {
            const percentageOver = (billComparison.variance / billComparison.predictedTotal) * 100;
            if (percentageOver > BUSINESS_CONSTANTS.VARIANCE.CRITICAL_VARIANCE_PERCENT) {
                insights.push({
                    type: 'warning',
                    message: `Bills are ${percentageOver.toFixed(0)}% higher than expected`,
                    priority: 2,
                });
            }
        }

        return insights.sort((a, b) => a.priority - b.priority);
    }
}
