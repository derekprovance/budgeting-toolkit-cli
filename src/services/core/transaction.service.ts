import {
    TransactionRead,
    TransactionSplit,
    TransactionUpdate,
} from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { logger as defaultLogger } from '../../logger.js';
import { IDateRangeService } from '../../types/interface/date-range.service.interface.js';
import { ITransactionService } from './transaction.service.interface.js';
import { ILogger } from '../../types/interface/logger.interface.js';
import { IExcludedTransactionService } from '../excluded-transaction.service.interface.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';
import { fetchAllPages, PAGE_SIZE } from '../../utils/pagination.utils.js';

class TransactionError extends Error {
    constructor(
        message: string,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = 'TransactionError';
    }
}

type TransactionCache = Map<string, Promise<TransactionSplit[]>>;
type TransactionSplitIndex = Map<string, TransactionRead>;
export class TransactionService implements ITransactionService {
    private readonly cache: TransactionCache;
    private readonly splitTransactionIdx: TransactionSplitIndex;
    private readonly logger: ILogger;
    /** Splits removed by the exclusion list, per cache key */
    private readonly excludedByKey: Map<string, TransactionSplit[]>;

    constructor(
        private readonly excludedTransactionService: IExcludedTransactionService,
        private readonly client: FireflyClientWithCerts,
        private readonly dateRangeService: IDateRangeService,
        cacheImplementation: TransactionCache = new Map(),
        logger: ILogger = defaultLogger
    ) {
        this.cache = cacheImplementation;
        this.splitTransactionIdx = new Map();
        this.logger = logger;
        this.excludedByKey = new Map();
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

            return transactions;
        } catch (error) {
            throw this.handleError('fetch transactions for month', month, error);
        }
    }

    /**
     * Retrieves the transactions for a month that the exclusion list removed.
     * Shares the same fetch as getTransactionsForMonth.
     */
    async getExcludedTransactionsForMonth(
        month: number,
        year: number
    ): Promise<TransactionSplit[]> {
        const cacheKey = `month-${month}-year-${year}`;
        // Awaiting the normal fetch guarantees the excluded set is populated
        await this.getTransactionsForMonth(month, year);
        return this.excludedByKey.get(cacheKey) ?? [];
    }

    /**
     * The date of the most recent transaction, for reporting how current the
     * data is.
     *
     * Deliberately the transaction's own `date`, not the record's `created_at`.
     * Firefly lists newest-by-date first, so `created_at` would answer "when
     * was this imported" — importing a backdated batch today would report data
     * current as of today, which is the false reassurance this exists to
     * prevent.
     */
    async getMostRecentTransactionDate(): Promise<Date | null> {
        const response = await this.client.transactions.listTransaction(undefined, 1);
        if (!response || !response.data || response.data.length === 0) {
            throw new Error(`Failed to fetch transactions`);
        }
        const date = response.data[0]?.attributes?.transactions?.[0]?.date;
        return date ? new Date(date) : null;
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

            return transactions;
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
            const transactionRead = this.getTransactionReadBySplit(transaction);
            if (!transactionRead?.id) {
                this.logger.error(
                    {
                        transactionId: transaction.transaction_journal_id,
                        description: transaction.description,
                    },
                    'Unable to find Transaction ID for Split'
                );
                return undefined;
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
            return undefined;
        }
    }

    getTransactionReadBySplit(splitTransaction: TransactionSplit): TransactionRead | undefined {
        const result = this.splitTransactionIdx.get(
            this.generateSplitTransactionKey(splitTransaction)
        );

        return result;
    }

    private getFromCacheOrFetch(
        key: string,
        fetchFn: () => Promise<TransactionRead[]>
    ): Promise<TransactionSplit[]> {
        // Cache the in-flight promise, not the resolved value: concurrent callers
        // with the same key (e.g. the analyze command's parallel services) share
        // one API fetch instead of stampeding.
        const inflight = this.cache.get(key);
        if (inflight) {
            return inflight;
        }

        const promise = (async () => {
            const data = await fetchFn();

            const transactions: TransactionSplit[] = [];
            const excluded: TransactionSplit[] = [];

            for (const trx of TransactionCalculationUtils.flattenTransactions(data)) {
                if (
                    this.excludedTransactionService.isExcludedTransaction(
                        trx.description,
                        trx.amount
                    )
                ) {
                    excluded.push(trx);
                } else {
                    transactions.push(trx);
                }
            }

            this.excludedByKey.set(key, excluded);
            this.storeTransactionSplitInIndex(data);

            return transactions;
        })();

        this.cache.set(key, promise);
        // Don't cache failures — let the next caller retry
        promise.catch(() => {
            this.cache.delete(key);
            this.excludedByKey.delete(key);
        });

        return promise;
    }

    private storeTransactionSplitInIndex(transactions: TransactionRead[]) {
        transactions.forEach(tx => {
            const splitTransactions = tx.attributes.transactions;
            splitTransactions.forEach(txSp => {
                const isExcluded = this.excludedTransactionService.isExcludedTransaction(
                    txSp.description,
                    txSp.amount
                );
                if (!isExcluded) {
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
                }
            });
        });
    }

    private async fetchTransactionsByTag(tag: string): Promise<TransactionRead[]> {
        return fetchAllPages(
            page => this.client.tags.listTransactionByTag(tag, undefined, PAGE_SIZE, page),
            `fetch transactions for tag: ${tag}`,
            this.logger
        );
    }

    private async fetchTransactionsFromAPIByMonth(
        month: number,
        year: number
    ): Promise<TransactionRead[]> {
        const range = this.dateRangeService.getDateRange(month, year);
        return fetchAllPages(
            page =>
                this.client.transactions.listTransaction(
                    undefined, // xTraceId
                    PAGE_SIZE,
                    page,
                    range.startDateString,
                    range.endDateString
                ),
            `fetch transactions for month: ${month}`,
            this.logger
        );
    }

    private generateSplitTransactionKey(tx: TransactionSplit): string {
        const journalId = tx.transaction_journal_id ?? 'unknown';
        const description = tx.description ?? 'unknown';
        const date = tx.date ?? 'unknown';
        return `${description}-${date}-${journalId}`;
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
