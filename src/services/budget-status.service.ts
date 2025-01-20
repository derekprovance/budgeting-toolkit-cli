import { BudgetStatusDto } from "../dto/budget-status.dto";
import { BudgetService } from "./core/budget.service";
import { TransactionService } from "./core/transaction.service";

export class BudgetStatusService {
  constructor(
    private budgetService: BudgetService,
    private transactionService: TransactionService
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
    const updatedOn =
      await this.transactionService.getMostRecentTransactionDate();

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
        updatedOn,
      } as BudgetStatusDto);
    });

    return budgetStatuses;
  }
}
