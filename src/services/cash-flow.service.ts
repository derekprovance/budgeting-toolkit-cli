import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import {
    Bucket,
    BUCKETS,
    ITransactionClassificationService,
} from './core/transaction-classification.service.interface.js';
import { AccountScopeService } from './core/account-scope.service.js';
import { ILogger } from '../types/interface/logger.interface.js';
import { logger as defaultLogger } from '../logger.js';
import { Result } from '../types/result.type.js';
import { MonthError, monthFailure } from '../types/error/month.error.js';

/** A month's transactions, each in the one bucket it is charged to */
export type MonthBuckets = Record<Bucket, TransactionSplit[]>;

/**
 * Sorts a month's transactions into buckets. Every figure `analyze` and
 * `report` print is a total over these buckets, so the two commands cannot
 * disagree about what a transaction is.
 *
 * Transactions no bucket claims — anything outside the envelope, and transfers
 * inside or into it — are dropped here and appear nowhere (RULES.md).
 */
export class CashFlowService {
    constructor(
        private readonly transactionService: ITransactionService,
        private readonly transactionClassificationService: ITransactionClassificationService,
        private readonly accountScope: AccountScopeService,
        private readonly logger: ILogger = defaultLogger
    ) {}

    async getBuckets(month: number, year: number): Promise<Result<MonthBuckets, MonthError>> {
        let transactions: TransactionSplit[];
        try {
            transactions = await this.transactionService.getTransactionsForMonth(month, year);
        } catch (error) {
            return monthFailure('TRANSACTIONS_FETCH_FAILED', { month, year }, error);
        }

        try {
            return Result.ok(await this.sort(transactions));
        } catch (error) {
            return monthFailure('BUCKETS_FAILED', { month, year }, error);
        }
    }

    private async sort(transactions: TransactionSplit[]): Promise<MonthBuckets> {
        const scope = await this.accountScope.getScope();
        const sorted = Map.groupBy(transactions, transaction =>
            this.transactionClassificationService.classify(transaction, scope)
        );
        // Object.fromEntries types its keys as plain strings; BUCKETS supplies every key
        const buckets = Object.fromEntries(
            BUCKETS.map(bucket => [bucket, sorted.get(bucket) ?? []])
        ) as MonthBuckets;

        this.logger.debug(
            Object.fromEntries(BUCKETS.map(b => [b, buckets[b].length])),
            'Sorted transactions into buckets'
        );

        return buckets;
    }
}
