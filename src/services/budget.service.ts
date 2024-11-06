import { BudgetArray, BudgetRead } from "@derekprovance/firefly-iii-sdk";
import { FireflyApiClient } from "../api/firefly.client";

export class BudgetService {
  constructor(private readonly apiClient: FireflyApiClient) {}

  async getBudgets(): Promise<BudgetRead[]> {
    const budgets = await this.fetchBudgets();
    return budgets.filter(budget => budget.attributes.active);
  }

  private async fetchBudgets(): Promise<BudgetRead[]> {
    const results = await this.apiClient.get<BudgetArray>(`/budgets`);
    return results.data
  }
}
