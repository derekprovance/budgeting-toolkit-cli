import { BudgetArray, BudgetRead } from "@derekprovance/firefly-iii-sdk";
import { FireflyApiClient, FireflyApiError } from "../../api/firefly.client";

export class BudgetService {
  constructor(private readonly apiClient: FireflyApiClient) {}

  async getBudgets(): Promise<BudgetRead[]> {
    const budgets = await this.fetchBudgets();
    return budgets.filter(budget => budget.attributes.active);
  }

  private async fetchBudgets(): Promise<BudgetRead[]> {
    const results = await this.apiClient.get<BudgetArray>(`/budgets`);
    if (!results) {
      throw new FireflyApiError('Failed to fetch budgets');
    }
    return results.data
  }
}
