import {
  TransactionArray,
  TransactionRead,
  TransactionSplit,
  TransactionTypeProperty,
} from "@derekprovance/firefly-iii-sdk";
import { DateRange } from "../../dto/date-range.dto";
import { FireflyApiClient } from "../../api/firefly.client";
import { logger } from "../../logger";

class TransactionError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = "TransactionError";
  }
}

type TransactionCache = Map<string, TransactionRead[]>;
type TransactionSplitIndex = Map<string, TransactionRead>;

interface TransactionUpdateResult {
  success: boolean;
  error?: Error;
  transactionId?: string;
}

export class TransactionService {
  private readonly cache: TransactionCache;
  private readonly splitTransactionIdx: TransactionSplitIndex;
  private readonly currentYear: number;

  constructor(
    private readonly apiClient: FireflyApiClient,
    cacheImplementation: TransactionCache = new Map()
  ) {
    this.cache = cacheImplementation;
    this.splitTransactionIdx = new Map();
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
      const cacheKey = `tag-${tag}`;
      const transactions = await this.getFromCacheOrFetch(cacheKey, () =>
        this.fetchTransactionsByTag(tag)
      );

      return this.flattenTransactions(transactions);
    } catch (error) {
      throw this.handleError("fetch transactions by tag", tag, error);
    }
  }

  async updateTransaction(
    transaction: TransactionSplit,
    category?: string,
    budgetId?: string
  ): Promise<TransactionUpdateResult> {
    if (!transaction?.transaction_journal_id) {
      return {
        success: false,
        error: new Error("Invalid transaction: missing transaction_journal_id"),
      };
    }

    if (
      ![
        TransactionTypeProperty.DEPOSIT,
        TransactionTypeProperty.WITHDRAWAL,
      ].includes(transaction.type)
    ) {
      return {
        success: false,
        error: new Error(
          `Unsupported transaction type ${transaction.type} for transaction_journal_id ${transaction.transaction_journal_id}`
        ),
      };
    }
    logger.debug(
      {
        description: transaction.description,
        category,
        budgetId,
        journalId: transaction.transaction_journal_id,
      },
      "Updating transaction"
    );

    try {
      const transactionRead = await this.getTransactionReadBySplit(transaction);
      if (!transactionRead?.id) {
        return {
          success: false,
          error: new Error("Unable to find Transaction ID for Split"),
        };
      }

      const updatePayload = {
        apply_rules: true,
        fire_webhooks: true,
        transactions: [
          {
            transaction_journal_id: transaction.transaction_journal_id,
            ...(category && { category_name: category }),
            ...(budgetId && { budget_id: budgetId }),
          },
        ],
      };

      await this.apiClient.put<TransactionArray>(
        `/transactions/${transactionRead.id}`,
        updatePayload
      );

      this.clearCache();

      return {
        success: true,
        transactionId: transactionRead.id,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      logger.error(
        {
          error: errorMessage,
          transactionDetails: {
            description: transaction.description,
            journalId: transaction.transaction_journal_id,
          },
        },
        "Transaction update failed"
      );

      return {
        success: false,
        error: new Error(
          `Transaction update failed for journal ID ${transaction.transaction_journal_id}: ${errorMessage}`
        ),
      };
    }
  }

  /**
   * Clears the transaction cache
   */
  clearCache(): void {
    this.cache.clear();
    this.splitTransactionIdx.clear();
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
    this.storeTransactionSplitInIndex(data);
    return data;
  }

  private storeTransactionSplitInIndex(transactions: TransactionRead[]) {
    transactions.forEach((tx) => {
      const splitTransactions = tx.attributes.transactions;
      splitTransactions.forEach((txSp) => {
        const indexKey = this.generateSplitTransactionKey(txSp);

        if (this.splitTransactionIdx.has(indexKey)) {
          logger.warn(`Duplicate transaction found for key: ${indexKey}`);
        }

        this.splitTransactionIdx.set(
          this.generateSplitTransactionKey(txSp),
          tx
        );
      });
    });
  }

  private getTransactionReadBySplit(
    splitTransaction: TransactionSplit
  ): TransactionRead | null {
    const result = this.splitTransactionIdx.get(
      this.generateSplitTransactionKey(splitTransaction)
    );

    return result ? result : null;
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

  private generateSplitTransactionKey(tx: TransactionSplit): string {
    return `${tx.description}-${tx.date}-${tx.transaction_journal_id}`;
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
