import { BudgetStatusDto } from "../dto/budget-status.dto";

export interface BudgetStatusService {
  getBudgetStatus(month: number, year: number): Promise<BudgetStatusDto[]>;
}
