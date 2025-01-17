import { DateRange } from "../../dto/date-range.dto";

export class DateRangeService {
  static getMonthDateRange(month: number, year: number): DateRange {
    this.validateMonth(month);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    return {
      start: this.formatDate(startDate),
      end: this.formatDate(endDate),
    };
  }

  private static formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  private static validateMonth(month: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error("Month must be an integer between 1 and 12");
    }
  }
}
