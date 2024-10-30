import {
  TransactionArray,
  TransactionRead,
  TransactionSplit,
} from "firefly-iii-sdk";
import { DateRange } from "../dto/DateRange.dto";
import { FireflyApiClient } from "../api/client";
import { logger } from "../logger";

interface TransactionStore {
  [key: number]: TransactionRead[];
}
export class TransactionService {
  private transactionStore: TransactionStore = {};

  constructor(private apiClient: FireflyApiClient) {}

  async getTransactionsForMonth(month: number): Promise<TransactionSplit[]> {
    try {
      const data =
        this.transactionStore[month] ??
        (await this.fetchTransactionsFromAPI(month));

      if (!this.transactionStore[month]) {
        this.transactionStore[month] = data;
      }

      return this.flattenTransactionsResults(data) ?? [];
    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Failed to fetch transactions for month ${month}:`, error.message);
        throw new Error(`Failed to fetch transactions: ${error.message}`);
      }
      throw error;
    }
  }

  private async fetchTransactionsFromAPI(
    month: number
  ): Promise<TransactionRead[]> {
    if (month < 1 || month > 12) {
      throw new Error("Month must be between 1 and 12");
    }

    const range = this.convertMonthToRange(month);
    const response = await this.apiClient.get<TransactionArray>(
      `/transactions?start=${range.start}&end=${range.end}`
    );

    return response.data;
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
