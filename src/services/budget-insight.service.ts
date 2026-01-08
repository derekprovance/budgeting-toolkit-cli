import { EnhancedBudgetReportDto } from '../types/dto/enhanced-budget-report.dto.js';
import { BillComparisonDto } from '../types/dto/bill-comparison.dto.js';
import { BudgetInsight } from '../types/dto/budget-insight.dto.js';
import { CurrencyUtils } from '../utils/currency.utils.js';

/**
 * Service for generating rule-based insights about spending patterns
 * Analyzes budget data to produce actionable recommendations
 */
export class BudgetInsightService {
    /**
     * Generates spending insights from budget, bill, and transaction data
     * Applies simple rules to identify patterns and issues
     * @param budgets Enhanced budget report data
     * @param billComparison Bill comparison data
     * @returns Array of insights sorted by priority
     */
    generateInsights(
        budgets: EnhancedBudgetReportDto[],
        billComparison: BillComparisonDto
    ): BudgetInsight[] {
        const insights: BudgetInsight[] = [];

        // Rule 1: Biggest overspend - identify worst over-budget category
        const overBudgets = budgets
            .filter(b => b.status === 'over')
            .sort((a, b) => b.percentageUsed - a.percentageUsed);

        if (overBudgets.length > 0) {
            const worst = overBudgets[0];
            const overPercent = worst.percentageUsed - 100;
            insights.push({
                type: 'warning',
                message: `${worst.name} is your biggest issue - ${overPercent.toFixed(0)}% over budget`,
                priority: 1,
                relatedBudget: worst.budgetId,
            });
        }

        // Rule 2: High transaction frequency
        budgets.forEach(budget => {
            if (
                budget.transactionStats &&
                budget.transactionStats.count &&
                budget.transactionStats.count >= 30 &&
                budget.spent !== 0
            ) {
                const avgSpent = Math.abs(budget.spent) / budget.transactionStats.count;
                const avgFormatted = CurrencyUtils.formatWithSymbol(avgSpent, billComparison.currencySymbol);
                insights.push({
                    type: 'info',
                    message: `You had ${budget.transactionStats.count} transactions in ${budget.name} (avg ${avgFormatted} each)`,
                    priority: 2,
                    relatedBudget: budget.budgetId,
                });
            }
        });

        // Rule 3: Good performance - budgets well under budget
        const underBudgets = budgets
            .filter(b => b.status === 'under' && b.percentageUsed < 70 && b.spent !== 0)
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

        // Rule 5: Significant bill variance
        if (billComparison.variance > 0) {
            const percentageOver = (billComparison.variance / billComparison.predictedTotal) * 100;
            if (percentageOver > 20) {
                insights.push({
                    type: 'warning',
                    message: `Bills are ${percentageOver.toFixed(0)}% higher than expected`,
                    priority: 2,
                });
            }
        }

        // Return sorted by priority (lower number = higher priority)
        return insights.sort((a, b) => a.priority - b.priority);
    }
}
