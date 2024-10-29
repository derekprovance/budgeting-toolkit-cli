import {
  TransactionArray,
  TransactionRead,
  TransactionSplit,
} from "firefly-iii-sdk";
import { DateRange } from "../dto/DateRange.dto";
import { FireflyApiClient } from "../api/client";

export class TransactionService {
  constructor(private apiClient: FireflyApiClient) {}

  async getTransactionsForMonth(month: number): Promise<TransactionSplit[]> {
    const range = this.convertMonthToRange(month);
    const transactions = await this.apiClient.get<TransactionArray>(
      `/transactions?start=${range.start}&end=${range.end}`
    );
    return this.flattenTransactionsResults(transactions.data);
  }

  private flattenTransactionsResults(
    transactions: TransactionRead[]
  ): TransactionSplit[] {
    return transactions.flatMap((transaction) => {
      return transaction.attributes?.transactions;
    });
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
