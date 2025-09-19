import {
    FireflyApiClient,
    FireflyApiError,
    TagSingle,
    TransactionArray,
    TransactionRead,
    TransactionSplit,
} from "@derekprovance/firefly-iii-sdk";
import { logger } from "../../logger";
import { DateRangeService } from "../../types/interface/date-range.service.interface";

class TransactionError extends Error {
    constructor(
        message: string,
        public readonly originalError?: Error,
    ) {
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
        cacheImplementation: TransactionCache = new Map(),
    ) {
        this.cache = cacheImplementation;
        this.splitTransactionIdx = new Map();
    }

    /**
     * Retrieves transactions for a specific month, using cache when available
     */
    async getTransactionsForMonth(
        month: number,
        year: number,
    ): Promise<TransactionSplit[]> {
        try {
            const cacheKey = `month-${month}-year-${year}`;
            const transactions = await this.getFromCacheOrFetch(cacheKey, () =>
                this.fetchTransactionsFromAPIByMonth(month, year),
            );

            return this.flattenTransactions(transactions);
        } catch (error) {
            throw this.handleError(
                "fetch transactions for month",
                month,
                error,
            );
        }
    }

    async getMostRecentTransactionDate(): Promise<Date | null> {
        const response = await this.apiClient.get<TransactionArray>(
            `/transactions?limit=1`,
        );
        if (!response) {
            throw new FireflyApiError(`Failed to fetch transactions`);
        }
        const transaction = response.data[0];
        return transaction.attributes && transaction.attributes.created_at
            ? new Date(transaction.attributes.created_at)
            : null;
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
                this.fetchTransactionsByTag(tag),
            );

            return this.flattenTransactions(transactions);
        } catch (error) {
            throw this.handleError("fetch transactions by tag", tag, error);
        }
    }

    async tagExists(tag: string): Promise<boolean> {
        const response = await this.apiClient.get<TagSingle>(
            `/tags/${encodeURIComponent(tag)}`,
        );
        return response?.data !== undefined;
    }

    async updateTransaction(
        transaction: TransactionSplit,
        category?: string,
        budgetId?: string,
    ) {
        if (!transaction?.transaction_journal_id) {
            throw new TransactionError(
                `Invalid transaction: missing transaction_journal_id for ${transaction.description}`,
            );
        }

        if (!["deposit", "withdrawal"].includes(transaction.type)) {
            throw new TransactionError(
                `Unsupported transaction type ${transaction.type} for transaction_journal_id ${transaction.transaction_journal_id}`,
            );
        }

        logger.debug(
            {
                transactionId: transaction.transaction_journal_id,
                type: transaction.type,
                category,
                budgetId,
            },
            `Updating transaction: ${transaction.description}`,
        );

        try {
            const transactionRead =
                await this.getTransactionReadBySplit(transaction);
            if (!transactionRead?.id) {
                logger.error(
                    {
                        transactionId: transaction.transaction_journal_id,
                        description: transaction.description,
                    },
                    "Unable to find Transaction ID for Split",
                );
                return;
            }

            const updatePayload = {
                apply_rules: true,
                fire_webhooks: true,
                transactions: [
                    {
                        transaction_journal_id:
                            transaction.transaction_journal_id,
                        ...(category && { category_name: category }),
                        ...(budgetId && { budget_id: budgetId }),
                    },
                ],
            };

            await this.apiClient.put<TransactionArray>(
                `/transactions/${transactionRead.id}`,
                updatePayload,
            );
            logger.debug(
                {
                    transactionId: transaction.transaction_journal_id,
                    updatedFields: Object.keys(updatePayload.transactions[0]),
                },
                `Transaction updated successfully`,
            );
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "Unknown error occurred";

            logger.error(
                {
                    error: errorMessage,
                    transactionId: transaction.transaction_journal_id,
                    description: transaction.description,
                },
                "Transaction update failed",
            );
        }
    }

    getTransactionReadBySplit(
        splitTransaction: TransactionSplit,
    ): TransactionRead | null {
        const result = this.splitTransactionIdx.get(
            this.generateSplitTransactionKey(splitTransaction),
        );

        return result ? result : null;
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
        fetchFn: () => Promise<TransactionRead[]>,
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
                    logger.debug(
                        {
                            transactionId: txSp.transaction_journal_id,
                            description: txSp.description,
                        },
                        "Duplicate transaction found in index",
                    );
                }

                this.splitTransactionIdx.set(
                    this.generateSplitTransactionKey(txSp),
                    tx,
                );
            });
        });
    }

    private async fetchTransactionsByTag(
        tag: string,
    ): Promise<TransactionRead[]> {
        const response = await this.apiClient.get<TransactionArray>(
            `/tags/${encodeURIComponent(tag)}/transactions`,
        );
        if (!response) {
            throw new FireflyApiError(
                `Failed to fetch transactions for tag: ${tag}`,
            );
        }
        return response.data;
    }

    private async fetchTransactionsFromAPIByMonth(
        month: number,
        year: number,
    ): Promise<TransactionRead[]> {
        const range = DateRangeService.getDateRange(month, year);
        const response = await this.apiClient.get<TransactionArray>(
            `/transactions?start=${range.startDate.toISOString()}&end=${range.endDate.toISOString()}`,
        );
        if (!response) {
            throw new FireflyApiError(
                `Failed to fetch transactions for month: ${month}`,
            );
        }
        return response.data;
    }

    private flattenTransactions(
        transactions: TransactionRead[],
    ): TransactionSplit[] {
        return transactions.flatMap(
            (transaction) => transaction.attributes?.transactions ?? [],
        );
    }

    private generateSplitTransactionKey(tx: TransactionSplit): string {
        return `${tx.description}-${tx.date}-${tx.transaction_journal_id}`;
    }

    private handleError(
        action: string,
        identifier: string | number,
        error: unknown,
    ): TransactionError {
        const message = `Failed to ${action} ${identifier}`;
        logger.error(
            {
                action,
                identifier,
                error: error instanceof Error ? error.message : "Unknown error",
            },
            message,
        );

        if (error instanceof Error) {
            return new TransactionError(message, error);
        }
        return new TransactionError(message);
    }
}
