import {
  TransactionArray,
  TransactionRead,
  TransactionSplit,
} from "firefly-iii-sdk";
import { DateRange } from "../dto/DateRange.dto";
import { FireflyApiClient } from "../api/FireflyApiClient";
import { logger } from "../logger";

class TransactionError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = "TransactionError";
  }
}

type TransactionCache = Map<string, TransactionRead[]>;

export class TransactionService {
  private readonly cache: TransactionCache;
  private readonly currentYear: number;

  constructor(
    private readonly apiClient: FireflyApiClient,
    cacheImplementation: TransactionCache = new Map()
  ) {
    this.cache = cacheImplementation;
    this.currentYear = new Date().getFullYear();
  }

  /**
   * Retrieves transactions for a specific month, using cache when available
   */
  async getTransactionsForMonth(month: number): Promise<TransactionSplit[]> {
    this.validateMonth(month);

    try {
      const cacheKey = `month-${month}`;
      const transactions = await this.getFromCacheOrFetch(cacheKey, () =>
        this.fetchTransactionsFromAPIByMonth(month)
      );

      return this.flattenTransactions(transactions);
    } catch (error) {
      throw this.handleError("fetch transactions for month", month, error);
    }
  }

  /**
   * Retrieves transactions by tag
   */
  async getTransactionsByTag(tag: string): Promise<TransactionSplit[]> {
    if (!tag) {
      throw new TransactionError("Tag parameter is required");
    }

    try {
      const transactions = await this.fetchTransactionsByTag(tag);
      return this.flattenTransactions(transactions);
    } catch (error) {
      throw this.handleError("fetch transactions by tag", tag, error);
    }
  }

  /**
   * Clears the transaction cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  private async getFromCacheOrFetch(
    key: string,
    fetchFn: () => Promise<TransactionRead[]>
  ): Promise<TransactionRead[]> {
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    const data = await fetchFn();
    this.cache.set(key, data);
    return data;
  }

  private async fetchTransactionsByTag(
    tag: string
  ): Promise<TransactionRead[]> {
    const response = await this.apiClient.get<TransactionArray>(
      `/tags/${encodeURIComponent(tag)}/transactions`
    );
    return response.data;
  }

  private async fetchTransactionsFromAPIByMonth(
    month: number
  ): Promise<TransactionRead[]> {
    const range = this.getMonthDateRange(month);
    const response = await this.apiClient.get<TransactionArray>(
      `/transactions?start=${range.start}&end=${range.end}`
    );
    return response.data;
  }

  private flattenTransactions(
    transactions: TransactionRead[]
  ): TransactionSplit[] {
    return transactions.flatMap(
      (transaction) => transaction.attributes?.transactions ?? []
    );
  }

  private getMonthDateRange(month: number): DateRange {
    const startDate = new Date(this.currentYear, month - 1, 1);
    const endDate = new Date(this.currentYear, month, 0);

    return {
      start: this.formatDate(startDate),
      end: this.formatDate(endDate),
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  private validateMonth(month: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new TransactionError("Month must be an integer between 1 and 12");
    }
  }

  private handleError(
    action: string,
    identifier: string | number,
    error: unknown
  ): TransactionError {
    const message = `Failed to ${action} ${identifier}`;
    logger.error(message, error);

    if (error instanceof Error) {
      return new TransactionError(message, error);
    }
    return new TransactionError(message);
  }
}
