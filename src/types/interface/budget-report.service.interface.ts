import { BudgetReportDto } from '../dto/budget-report.dto';

export interface BudgetReportService {
    getBudgetReport(month: number, year: number): Promise<BudgetReportDto[]>;
}
