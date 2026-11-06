import {
    ApiError,
    TransactionRead,
    TransactionSplit,
    TransactionUpdate,
} from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { logger as defaultLogger } from '../../logger.js';
import { ITransactionService } from './transaction.service.interface.js';
import { ILogger } from '../../types/interface/logger.interface.js';
import { IExcludedTransactionService } from '../excluded-transaction.service.interface.js';
import { fetchAllPages, PAGE_SIZE } from '../../utils/pagination.utils.js';
import { monthRange } from '../../utils/date.utils.js';
import { errorMessage } from '../../utils/error-detection.utils.js';

class TransactionError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'TransactionError';
    }
}

type TransactionCache = Map<string, Promise<TransactionSplit[]>>;
type TransactionSplitIndex = Map<string, TransactionRead>;
export class TransactionService implements ITransactionService {
    private readonly cache: TransactionCache;
    private readonly splitTransactionIdx: TransactionSplitIndex;
    private readonly logger: ILogger;

    constructor(
        private readonly excludedTransactionService: IExcludedTransactionService,
        private readonly client: FireflyClientWithCerts,
        cacheImplementation: TransactionCache = new Map(),
        logger: ILogger = defaultLogger
    ) {
        this.cache = cacheImplementation;
        this.splitTransactionIdx = new Map();
        this.logger = logger;
    }

    async getTransactionsForMonth(month: number, year: number): Promise<TransactionSplit[]> {
        try {
            const cacheKey = `month-${month}-year-${year}`;
            const transactions = await this.getFromCacheOrFetch(cacheKey, () =>
                this.fetchTransactionsFromAPIByMonth(month, year)
            );

            return transactions;
        } catch (error) {
            throw this.handleError('fetch transactions for month', `${month}/${year}`, error);
        }
    }

    /** Both `YYYY-MM-DD` dates are inclusive */
    async getTransactionsInRange(start: string, end: string): Promise<TransactionSplit[]> {
        try {
            const cacheKey = `range-${start}-${end}`;
            return await this.getFromCacheOrFetch(cacheKey, () =>
                this.fetchTransactionsFromAPIByRange(
                    start,
                    end,
                    `fetch transactions for range: ${start}..${end}`
                )
            );
        } catch (error) {
            throw this.handleError('fetch transactions for range', `${start}..${end}`, error);
        }
    }

    /**
     * The transaction's own `date`, not `created_at`: importing a backdated
     * batch today must not report the data as current.
     *
     * @returns undefined when the ledger has no dated transaction
     */
    async getMostRecentTransactionDate(): Promise<Date | undefined> {
        const response = await this.client.transactions.listTransaction(undefined, 1);
        if (!response?.data) {
            throw new Error('Failed to fetch transactions: API returned empty response');
        }
        const date = response.data[0]?.attributes?.transactions?.[0]?.date;
        return date ? new Date(date) : undefined;
    }

    async getTransactionsByTag(tag: string): Promise<TransactionSplit[]> {
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

    /** @throws when Firefly cannot be asked; only its 404 means the tag is absent */
    async tagExists(tag: string): Promise<boolean> {
        try {
            const response = await this.client.tags.getTag(tag);
            return response?.data !== undefined;
        } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
                return false;
            }
            throw error;
        }
    }

    async updateTransaction(
        transaction: TransactionSplit,
        category?: string,
        budgetId?: string
    ): Promise<TransactionRead> {
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

        const transactionRead = this.getTransactionReadBySplit(transaction);
        if (!transactionRead?.id) {
            throw new TransactionError(
                `Unable to find transaction ID for split ${transaction.transaction_journal_id} (${transaction.description})`
            );
        }

        const journalId = transaction.transaction_journal_id;
        const change = {
            ...(category && { category_name: category }),
            ...(budgetId && { budget_id: budgetId }),
        };
        // Firefly deletes every split the PUT does not list, so all are named,
        // in Firefly's order. A multi-split PUT is rejected without the group
        // title, so it is sent back unchanged.
        const groupTitle = transactionRead.attributes.group_title;
        const updatePayload: TransactionUpdate = {
            apply_rules: true,
            fire_webhooks: true,
            ...(groupTitle && { group_title: groupTitle }),
            transactions: transactionRead.attributes.transactions.map(split =>
                split.transaction_journal_id === journalId
                    ? { transaction_journal_id: journalId, ...change }
                    : { transaction_journal_id: split.transaction_journal_id }
            ),
        };

        // Propagates, so the caller reports a failure rather than a skip
        const updatedTransaction = await this.client.transactions.updateTransaction(
            transactionRead.id,
            updatePayload
        );
        this.logger.debug(
            { transactionId: journalId, updatedFields: Object.keys(change) },
            `Transaction updated successfully`
        );

        return updatedTransaction.data;
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
        // The in-flight promise is cached so concurrent callers share one fetch
        const inflight = this.cache.get(key);
        if (inflight) {
            return inflight;
        }

        // R-EXCL-1: the one place exclusions are applied, so an excluded
        // transaction is gone from every bucket in every command
        const promise = (async () => {
            const included = (await fetchFn()).flatMap(group =>
                (group.attributes?.transactions ?? [])
                    .filter(split => !this.isExcluded(split))
                    .map(split => ({ group, split }))
            );
            this.index(included);
            return included.map(({ split }) => split);
        })();

        this.cache.set(key, promise);
        // A failure is not cached, so the next caller retries
        promise.catch(() => {
            this.cache.delete(key);
        });

        return promise;
    }

    private index(included: { group: TransactionRead; split: TransactionSplit }[]): void {
        for (const { group, split } of included) {
            const key = this.generateSplitTransactionKey(split);
            if (this.splitTransactionIdx.has(key)) {
                this.logger.debug(
                    { transactionId: split.transaction_journal_id, description: split.description },
                    'Duplicate transaction found in index'
                );
            }
            this.splitTransactionIdx.set(key, group);
        }
    }

    private isExcluded(transaction: TransactionSplit): boolean {
        return this.excludedTransactionService.isExcludedTransaction(
            transaction.description,
            transaction.amount
        );
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
        const { start, end } = monthRange(month, year);
        return this.fetchTransactionsFromAPIByRange(
            start,
            end,
            `fetch transactions for month: ${month}/${year}`
        );
    }

    private async fetchTransactionsFromAPIByRange(
        start: string,
        end: string,
        operation: string
    ): Promise<TransactionRead[]> {
        return fetchAllPages(
            page =>
                this.client.transactions.listTransaction(
                    undefined, // xTraceId
                    PAGE_SIZE,
                    page,
                    start,
                    end
                ),
            operation,
            this.logger
        );
    }

    private generateSplitTransactionKey(tx: TransactionSplit): string {
        const journalId = tx.transaction_journal_id ?? 'unknown';
        const description = tx.description ?? 'unknown';
        const date = tx.date ?? 'unknown';
        return `${description}-${date}-${journalId}`;
    }

    private handleError(action: string, identifier: string, error: unknown): TransactionError {
        const message = `Failed to ${action} ${identifier}: ${errorMessage(error)}`;
        this.logger.error({ action, identifier }, message);

        return new TransactionError(message, { cause: error });
    }
}
