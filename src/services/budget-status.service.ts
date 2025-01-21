import { BudgetStatusDto } from "../dto/budget-status.dto";
import { BudgetService } from "./core/budget.service";

export class BudgetStatusService {
  constructor(
    private budgetService: BudgetService,
  ) {}

  async getBudgetStatus(
    month: number,
    year: number
  ): Promise<BudgetStatusDto[]> {
    const budgetStatuses: BudgetStatusDto[] = [];

    const budgets = await this.budgetService.getBudgets();
    const insights = await this.budgetService.getBudgetExpenseInsights(
      month,
      year
    );
    const budgetLimits = await this.budgetService.getBudgetLimits(month, year);

    budgets.forEach((budget) => {
      const budgetName = budget.attributes.name;
      const budgetId = budget.id;

      const budgetLimit = budgetLimits.filter(
        (budgetLimit) => budgetLimit.attributes.budget_id === budgetId
      )[0];
      const insight = insights.find((insight) => insight.id == budgetId);

      budgetStatuses.push({
        name: budgetName,
        amount: budgetLimit ? Number(budgetLimit.attributes.amount) : 0.0,
        spent: insight ? insight.difference_float : 0.0,
      } as BudgetStatusDto);
    });

    return budgetStatuses;
  }
}
