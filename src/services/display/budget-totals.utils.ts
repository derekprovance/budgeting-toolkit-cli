import { BudgetReportDto } from '../../types/dto/budget-report.dto.js';

export interface BudgetTotals {
    spent: number;
    allocated: number;
    /** 0 when nothing is allocated */
    percentageUsed: number;
    isOverBudget: boolean;
}

/** The report's headline totals across every budget row, shared by the text and JSON reports */
export function budgetTotals(budgets: readonly BudgetReportDto[]): BudgetTotals {
    const spent = budgets.reduce((sum, budget) => sum + budget.spent, 0);
    const allocated = budgets.reduce((sum, budget) => sum + budget.amount, 0);
    return {
        spent,
        allocated,
        percentageUsed: allocated > 0 ? (spent / allocated) * 100 : 0,
        isOverBudget: spent > allocated,
    };
}
