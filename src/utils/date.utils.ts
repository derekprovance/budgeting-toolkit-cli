import { BudgetDateParams } from "../types/interface/budget-date-params.interface";
import { DateRangeDto } from "../types/dto/date-range.dto";

export class DateUtils {
    static validateMonthYear(month: number, year: number): void {
        if (!Number.isInteger(month) || month < 1 || month > 12) {
            throw new Error("Month must be an integer between 1 and 12");
        }
        if (!Number.isInteger(year) || year < 1900 || year > 9999) {
            throw new Error("Year must be a valid 4-digit year");
        }
    }

    static validateBudgetDateParams(params: BudgetDateParams): void {
        this.validateMonthYear(params.month, params.year);
    }

    static validateDateRange(range: DateRangeDto): void {
        if (
            !(range.startDate instanceof Date) ||
            !(range.endDate instanceof Date)
        ) {
            throw new Error("Start and end dates must be valid Date objects");
        }
        if (range.startDate > range.endDate) {
            throw new Error("Start date must be before or equal to end date");
        }
    }
}
