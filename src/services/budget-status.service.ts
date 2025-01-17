import { BudgetStatusDto } from "../dto/budget-status.dto";
import { BudgetService } from "./core/budget.service";

export class BudgetStatusService {
  constructor(private budgetService: BudgetService) {}

  async getBudgetStatus(
    month: number,
    year: number
  ): Promise<BudgetStatusDto[]> {
    const budgetStatuses: BudgetStatusDto[] = [];

    const insights = await this.budgetService.getBudgetExpenseInsights(
      month,
      year
    );
    const budgetLimits = await this.budgetService.getBudgetLimits(month, year);

    budgetLimits.forEach((budgetLimit) => {
      const budgetLimitId = budgetLimit.attributes.budget_id;
      const insight = insights.find((insight) => insight.id == budgetLimitId);

      if (insight) {
        budgetStatuses.push({
          name: insight.name,
          amount: Number(budgetLimit.attributes.amount),
          spent: insight.difference_float,
        } as BudgetStatusDto);
      }
    });

    return budgetStatuses;
  }

  private getDaysLeftForMonth(): number {
    const now = new Date();
    const totalDays = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();

    return totalDays - now.getDate();
  }
}
