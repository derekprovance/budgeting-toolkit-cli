import { BudgetReportDto } from '../dto/budget-report.dto';

export interface BudgetReportService {
    getBudgetStatus(month: number, year: number): Promise<BudgetReportDto[]>;
}
