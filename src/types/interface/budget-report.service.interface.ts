import { BudgetReportDto } from '../dto/budget-report.dto.js';

export interface BudgetReportService {
    getBudgetReport(month: number, year: number): Promise<BudgetReportDto[]>;
}
