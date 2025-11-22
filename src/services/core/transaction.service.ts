import {
    TransactionRead,
    TransactionSplit,
    TransactionUpdate,
} from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { logger as defaultLogger } from '../../logger.js';
import { DateRangeService } from '../../types/interface/date-range.service.interface.js';
import { ITransactionService } from './transaction.service.interface.js';
import { ILogger } from '../../types/interface/logger.interface.js';

class TransactionError extends Error {
    constructor(
        message: string,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'TransactionError';
    }
}

type TransactionCache = Map<string, TransactionRead[]>;
type TransactionSplitIndex = Map<string, TransactionRead>;
export class TransactionService implements ITransactionService {
    private readonly cache: TransactionCache;
    private readonly splitTransactionIdx: TransactionSplitIndex;
    private readonly logger: ILogger;

    constructor(
        private readonly client: FireflyClientWithCerts,
        cacheImplementation: TransactionCache = new Map(),
        logger: ILogger = defaultLogger
    ) {
        this.cache = cacheImplementation;
        this.splitTransactionIdx = new Map();
        this.logger = logger;
    }

    /**
     * Retrieves transactions for a specific month, using cache when available
     */
    async getTransactionsForMonth(month: number, year: number): Promise<TransactionSplit[]> {
        try {
            const cacheKey = `month-${month}-year-${year}`;
            const transactions = await this.getFromCacheOrFetch(cacheKey, () =>
                this.fetchTransactionsFromAPIByMonth(month, year)
            );

            return this.flattenTransactions(transactions);
        } catch (error) {
            throw this.handleError('fetch transactions for month', month, error);
        }
    }

    async getMostRecentTransactionDate(): Promise<Date | null> {
        const response = await this.client.transactions.listTransaction(undefined, 1);
        if (!response || !response.data || response.data.length === 0) {
            throw new Error(`Failed to fetch transactions`);
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
            throw new TransactionError('Tag parameter is required');
        }

        try {
            const cacheKey = `tag-${tag}`;
            const transactions = await this.getFromCacheOrFetch(cacheKey, () =>
                this.fetchTransactionsByTag(tag)
            );

            return this.flattenTransactions(transactions);
        } catch (error) {
            throw this.handleError('fetch transactions by tag', tag, error);
        }
    }

    async tagExists(tag: string): Promise<boolean> {
        try {
            const response = await this.client.tags.getTag(tag);
            return response?.data !== undefined;
        } catch {
            // Tag doesn't exist
            return false;
        }
    }

    async updateTransaction(
        transaction: TransactionSplit,
        category?: string,
        budgetId?: string
    ): Promise<TransactionRead | undefined> {
        if (!transaction?.transaction_journal_id) {
            throw new TransactionError(
                `Invalid transaction: missing transaction_journal_id for ${transaction.description}`
            );
        }

        if (!['deposit', 'withdrawal'].includes(transaction.type)) {
            throw new TransactionError(
                `Unsupported transaction type ${transaction.type} for transaction_journal_id ${transaction.transaction_journal_id}`
            );
        }

        this.logger.debug(
            {
                transactionId: transaction.transaction_journal_id,
                type: transaction.type,
                category,
                budgetId,
            },
            `Updating transaction: ${transaction.description}`
        );

        try {
            const transactionRead = await this.getTransactionReadBySplit(transaction);
            if (!transactionRead?.id) {
                this.logger.error(
                    {
                        transactionId: transaction.transaction_journal_id,
                        description: transaction.description,
                    },
                    'Unable to find Transaction ID for Split'
                );
                return;
            }

            const updatePayload: TransactionUpdate = {
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

            const updatedTransaction = await this.client.transactions.updateTransaction(
                transactionRead.id,
                updatePayload
            );
            this.logger.debug(
                {
                    transactionId: transaction.transaction_journal_id,
                    updatedFields: Object.keys(updatePayload.transactions?.[0] ?? {}),
                },
                `Transaction updated successfully`
            );

            return updatedTransaction.data;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

            this.logger.error(
                {
                    error: errorMessage,
                    transactionId: transaction.transaction_journal_id,
                    description: transaction.description,
                },
                'Transaction update failed'
            );
        }
    }

    getTransactionReadBySplit(splitTransaction: TransactionSplit): TransactionRead | undefined {
        const result = this.splitTransactionIdx.get(
            this.generateSplitTransactionKey(splitTransaction)
        );

        return result;
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
        transactions.forEach(tx => {
            const splitTransactions = tx.attributes.transactions;
            splitTransactions.forEach(txSp => {
                const indexKey = this.generateSplitTransactionKey(txSp);

                if (this.splitTransactionIdx.has(indexKey)) {
                    this.logger.debug(
                        {
                            transactionId: txSp.transaction_journal_id,
                            description: txSp.description,
                        },
                        'Duplicate transaction found in index'
                    );
                }

                this.splitTransactionIdx.set(this.generateSplitTransactionKey(txSp), tx);
            });
        });
    }

    private async fetchTransactionsByTag(tag: string): Promise<TransactionRead[]> {
        const response = await this.client.tags.listTransactionByTag(tag);
        if (!response || !response.data) {
            throw new Error(`Failed to fetch transactions for tag: ${tag}`);
        }
        return response.data;
    }

    private async fetchTransactionsFromAPIByMonth(
        month: number,
        year: number
    ): Promise<TransactionRead[]> {
        const dateRangeService = new DateRangeService();
        const range = dateRangeService.getDateRange(month, year);
        const response = await this.client.transactions.listTransaction(
            undefined, // xTraceId
            undefined, // limit
            undefined, // page
            range.startDate.toISOString().split('T')[0],
            range.endDate.toISOString().split('T')[0]
        );
        if (!response || !response.data) {
            throw new Error(`Failed to fetch transactions for month: ${month}`);
        }
        return response.data;
    }

    private flattenTransactions(transactions: TransactionRead[]): TransactionSplit[] {
        return transactions.flatMap(transaction => transaction.attributes?.transactions ?? []);
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
        this.logger.error(
            {
                action,
                identifier,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            message
        );

        if (error instanceof Error) {
            return new TransactionError(message, error);
        }
        return new TransactionError(message);
    }
}
