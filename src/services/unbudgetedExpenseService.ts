import { FireflyApiClient } from "../api/client";
import { logger } from "../logger";

interface DateRange {
  start: string;
  end: string;
}

export class UnbudgetedExpenseService {
  constructor(private apiClient: FireflyApiClient) {}

  async getUnbudgetedExpenses(month: number) {
    const range = this.convertMonthToRange(month);
    const transactions = await this.apiClient.get(
      `/transactions?start=${range.start}&end=${range.end}`
    );
    console.log(transactions);
  }

  private convertMonthToRange(month: number): DateRange {
    const currentYear = new Date().getFullYear();
    const startDate = new Date(currentYear, month - 1, 1);
    const endDate = new Date(currentYear, month, 0);

    const formatDate = (date: Date): string => {
      return date.toISOString().split("T")[0];
    };

    return { start: formatDate(startDate), end: formatDate(endDate) };
  }
}
