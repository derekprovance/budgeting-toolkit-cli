import {
  BudgetArray,
  BudgetLimitArray,
  BudgetLimitRead,
  BudgetRead,
  FireflyApiClient,
  FireflyApiError,
  InsightGroup,
} from "@derekprovance/firefly-iii-sdk";
import { DateRangeService } from "./date-range.service";

export class BudgetService {
  constructor(private readonly apiClient: FireflyApiClient) {}

  async getBudgets(): Promise<BudgetRead[]> {
    const budgets = await this.fetchBudgets();
    return budgets.filter((budget) => budget.attributes.active);
  }

  async getBudgetExpenseInsights(
    month: number,
    year: number
  ): Promise<InsightGroup> {
    const range = DateRangeService.getMonthDateRange(month, year);

    const results = await this.apiClient.get<InsightGroup>(
      `/insight/expense/budget?start=${range.start}&end=${range.end}`
    );
    if (!results) {
      throw new FireflyApiError("Failed to fetch expense insights for budget");
    }
    return results;
  }

  async getBudgetLimits(
    month: number,
    year: number
  ): Promise<BudgetLimitRead[]> {
    const range = DateRangeService.getMonthDateRange(month, year);

    const results = await this.apiClient.get<BudgetLimitArray>(
      `/budget-limits?start=${range.start}&end=${range.end}`
    );
    if (!results) {
      throw new FireflyApiError("Failed to fetch expense insights for budget");
    }
    return results.data;
  }

  private async fetchBudgets(): Promise<BudgetRead[]> {
    const results = await this.apiClient.get<BudgetArray>(`/budgets`);
    if (!results) {
      throw new FireflyApiError("Failed to fetch budgets");
    }
    return results.data;
  }
}
