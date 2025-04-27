import {
  BudgetArray,
  BudgetLimitArray,
  BudgetLimitRead,
  BudgetRead,
  FireflyApiClient,
  FireflyApiError,
  InsightGroup,
} from "@derekprovance/firefly-iii-sdk";
import { DateRangeService } from "../../types/interface/date-range.service.interface";
import { DateUtils } from "../../utils/date.utils";
import { BudgetService as IBudgetService } from "../../types/interface/budget.service.interface";

export class BudgetService implements IBudgetService {
  constructor(private readonly apiClient: FireflyApiClient) {}

  async getBudgets(): Promise<BudgetRead[]> {
    const budgets = await this.fetchBudgets();
    return budgets.filter((budget) => budget.attributes.active);
  }

  async getBudgetExpenseInsights(
    month: number,
    year: number
  ): Promise<InsightGroup> {
    try {
      DateUtils.validateMonthYear(month, year);
      const range = DateRangeService.getDateRange(month, year);

      const results = await this.apiClient.get<InsightGroup>(
        `/insight/expense/budget?start=${range.startDate}&end=${range.endDate}`
      );
      if (!results) {
        throw new FireflyApiError("Failed to fetch expense insights for budget");
      }
      return results;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to get budget expense insights for month ${month}: ${error.message}`
        );
      }
      throw new Error(
        `Failed to get budget expense insights for month ${month}`
      );
    }
  }

  async getBudgetLimits(
    month: number,
    year: number
  ): Promise<BudgetLimitRead[]> {
    try {
      DateUtils.validateMonthYear(month, year);
      const range = DateRangeService.getDateRange(month, year);

      const results = await this.apiClient.get<BudgetLimitArray>(
        `/budget-limits?start=${range.startDate}&end=${range.endDate}`
      );
      if (!results) {
        throw new FireflyApiError("Failed to fetch expense insights for budget");
      }
      return results.data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to get budget limits for month ${month}: ${error.message}`
        );
      }
      throw new Error(
        `Failed to get budget limits for month ${month}`
      );
    }
  }

  private async fetchBudgets(): Promise<BudgetRead[]> {
    const results = await this.apiClient.get<BudgetArray>(`/budgets`);
    if (!results) {
      throw new FireflyApiError("Failed to fetch budgets");
    }
    return results.data;
  }
}
