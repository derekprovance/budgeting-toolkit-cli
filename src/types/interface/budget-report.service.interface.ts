import { BudgetLimitDto } from '../dto/budget-limit.dto.js';
import { Result } from '../result.type.js';
import { BudgetError } from '../error/budget.error.js';

export interface BudgetReportService {
    getBudgetReport(month: number, year: number): Promise<Result<BudgetLimitDto[], BudgetError>>;
}
