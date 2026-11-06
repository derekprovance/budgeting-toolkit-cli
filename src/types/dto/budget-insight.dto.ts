export interface BudgetInsight {
    type: 'warning' | 'success' | 'info';
    message: string;
    /** Lower sorts first */
    priority: number;
    relatedBudget?: string;
}
