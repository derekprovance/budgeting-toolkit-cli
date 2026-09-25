import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import {
    Bucket,
    BUCKETS,
    ITransactionClassificationService,
} from './core/transaction-classification.service.interface.js';
import { BaseTransactionAnalysisService } from './core/base-transaction-analysis.service.js';
import { AccountScopeService } from './core/account-scope.service.js';
import { ILogger } from '../types/interface/logger.interface.js';

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
export class CashFlowService extends BaseTransactionAnalysisService<MonthBuckets> {
    constructor(
        transactionService: ITransactionService,
        transactionClassificationService: ITransactionClassificationService,
        private readonly accountScope: AccountScopeService,
        logger?: ILogger
    ) {
        super(transactionService, transactionClassificationService, logger);
    }

    getBuckets(month: number, year: number) {
        return this.executeAnalysis(month, year);
    }

    protected async analyzeTransactions(transactions: TransactionSplit[]): Promise<MonthBuckets> {
        const scope = await this.accountScope.getScope();
        const buckets = Object.fromEntries(BUCKETS.map(b => [b, []])) as unknown as MonthBuckets;

        for (const transaction of transactions) {
            const bucket = this.transactionClassificationService.classify(transaction, scope);
            if (bucket) {
                buckets[bucket].push(transaction);
            }
        }

        this.logger.debug(
            Object.fromEntries(BUCKETS.map(b => [b, buckets[b].length])),
            'Sorted transactions into buckets'
        );

        return buckets;
    }

    protected getOperationName(): string {
        return 'getBuckets';
    }
}
