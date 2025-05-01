import {
  BudgetLimitRead,
  InsightGroup,
  BudgetRead,
} from "@derekprovance/firefly-iii-sdk";

export interface BudgetService {
  getBudgetLimits(month: number, year: number): Promise<BudgetLimitRead[]>;
  getBudgetExpenseInsights(month: number, year: number): Promise<InsightGroup>;
  getBudgets(): Promise<BudgetRead[]>;
}
