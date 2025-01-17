import {
  TagSingle,
  TransactionArray,
  TransactionRead,
  TransactionSplit,
  TransactionTypeProperty,
} from "@derekprovance/firefly-iii-sdk";
import { FireflyApiClient, FireflyApiError } from "../../api/firefly.client";
import { logger } from "../../logger";
import { DateRangeService } from "./date-range.service";

class TransactionError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = "TransactionError";
  }
}

type TransactionCache = Map<string, TransactionRead[]>;
type TransactionSplitIndex = Map<string, TransactionRead>;
export class TransactionService {
  private readonly cache: TransactionCache;
  private readonly splitTransactionIdx: TransactionSplitIndex;

  constructor(
    private readonly apiClient: FireflyApiClient,
    cacheImplementation: TransactionCache = new Map()
  ) {
    this.cache = cacheImplementation;
    this.splitTransactionIdx = new Map();
  }

  /**
   * Retrieves transactions for a specific month, using cache when available
   */
  async getTransactionsForMonth(
    month: number,
    year: number
  ): Promise<TransactionSplit[]> {
    try {
      const cacheKey = `month-${month}-year-${year}`;
      const transactions = await this.getFromCacheOrFetch(cacheKey, () =>
        this.fetchTransactionsFromAPIByMonth(month, year)
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

  async tagExists(tag: string): Promise<boolean> {
    const response = await this.apiClient.get<TagSingle>(
      `/tags/${encodeURIComponent(tag)}`
    );
    return response?.data !== undefined;
  }

  async updateTransaction(
    transaction: TransactionSplit,
    category?: string,
    budgetId?: string
  ) {
    if (!transaction?.transaction_journal_id) {
      throw new TransactionError(
        `Invalid transaction: missing transaction_journal_id for ${transaction.description}`
      );
    }

    if (
      ![
        TransactionTypeProperty.DEPOSIT,
        TransactionTypeProperty.WITHDRAWAL,
      ].includes(transaction.type)
    ) {
      throw new TransactionError(
        `Unsupported transaction type ${transaction.type} for transaction_journal_id ${transaction.transaction_journal_id}`
      );
    }

    logger.debug(
      {
        category,
        budgetId,
        journalId: transaction.transaction_journal_id,
      },
      `Updating transaction: ${transaction.description}`
    );

    try {
      const transactionRead = await this.getTransactionReadBySplit(transaction);
      if (!transactionRead?.id) {
        logger.error(
          {
            transaction: {
              transactionJournalId: transaction.transaction_journal_id,
              description: transaction.description,
            },
            transactionRead,
          },
          "Unable to find Transaction ID for Split"
        );
        return;
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

      const results = await this.apiClient.put<TransactionArray>(
        `/transactions/${transactionRead.id}`,
        updatePayload
      );
      logger.trace(
        { updatePayload, results },
        `Transaction Update results for ${transaction.transaction_journal_id}:${transaction.description}`
      );
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
    if (!response) {
      throw new FireflyApiError(`Failed to fetch transactions for tag: ${tag}`);
    }
    return response.data;
  }

  private async fetchTransactionsFromAPIByMonth(
    month: number,
    year: number
  ): Promise<TransactionRead[]> {
    const range = DateRangeService.getMonthDateRange(month, year);
    const response = await this.apiClient.get<TransactionArray>(
      `/transactions?start=${range.start}&end=${range.end}`
    );
    if (!response) {
      throw new FireflyApiError(
        `Failed to fetch transactions for month: ${month}`
      );
    }
    return response.data;
  }

  private flattenTransactions(
    transactions: TransactionRead[]
  ): TransactionSplit[] {
    return transactions.flatMap(
      (transaction) => transaction.attributes?.transactions ?? []
    );
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
    logger.trace(message, error);

    if (error instanceof Error) {
      return new TransactionError(message, error);
    }
    return new TransactionError(message);
  }
}
