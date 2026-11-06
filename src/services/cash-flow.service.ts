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
import { DateUtils } from '../utils/date.utils.js';
import {
    TransactionAnalysisError,
    TransactionAnalysisErrorFactory,
    TransactionAnalysisErrorType,
} from '../types/error/transaction-analysis.error.js';

/** A month's transactions, each in the one bucket it is charged to */
export type MonthBuckets = Record<Bucket, TransactionSplit[]>;

const OPERATION = 'getBuckets';

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

    async getBuckets(
        month: number,
        year: number
    ): Promise<Result<MonthBuckets, TransactionAnalysisError>> {
        const dateValidation = DateUtils.validateMonthYearResult(
            month,
            year,
            OPERATION,
            (m, y, op, err) =>
                TransactionAnalysisErrorFactory.create(
                    TransactionAnalysisErrorType.INVALID_DATE,
                    m,
                    y,
                    op,
                    err
                )
        );
        if (!dateValidation.ok) {
            return Result.err(dateValidation.error);
        }

        let transactions: TransactionSplit[];
        try {
            transactions = await this.transactionService.getTransactionsForMonth(month, year);
        } catch (error) {
            return this.fail(TransactionAnalysisErrorType.FETCH_FAILED, month, year, error);
        }

        try {
            return Result.ok(await this.sort(transactions));
        } catch (error) {
            return this.fail(TransactionAnalysisErrorType.CALCULATION_FAILED, month, year, error);
        }
    }

    private async sort(transactions: TransactionSplit[]): Promise<MonthBuckets> {
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

    private fail(
        type: TransactionAnalysisErrorType,
        month: number,
        year: number,
        error: unknown
    ): Result<MonthBuckets, TransactionAnalysisError> {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
            {
                month,
                year,
                operation: OPERATION,
                error: err.message,
                errorType: err.constructor.name,
            },
            `${OPERATION} failed`
        );
        return Result.err(
            TransactionAnalysisErrorFactory.create(type, month, year, OPERATION, err)
        );
    }
}
