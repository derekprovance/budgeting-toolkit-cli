import {
    BudgetLimitRead,
    BudgetRead,
    InsightGroup,
    TransactionSplit,
} from '@derekprovance/firefly-iii-sdk';

export interface IBudgetService {
    getBudgets(): Promise<BudgetRead[]>;
    getBudgetExpenseInsights(month: number, year: number): Promise<InsightGroup>;
    getBudgetLimits(month: number, year: number): Promise<BudgetLimitRead[]>;
    getTransactionsWithoutBudget(month: number, year: number): Promise<TransactionSplit[]>;
}
