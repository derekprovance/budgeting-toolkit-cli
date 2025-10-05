import { BudgetStatusDto } from '../dto/budget-status.dto';

export interface BudgetReportService {
    getBudgetStatus(month: number, year: number): Promise<BudgetStatusDto[]>;
}
