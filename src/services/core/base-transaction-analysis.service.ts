import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './transaction.service.interface.js';
import { ITransactionClassificationService } from './transaction-classification.service.interface.js';
import { Result } from '../../types/result.type.js';
import {
    TransactionAnalysisError,
    TransactionAnalysisErrorFactory,
    TransactionAnalysisErrorType,
} from '../../types/error/transaction-analysis.error.js';
import { DateUtils } from '../../utils/date.utils.js';
import { logger as defaultLogger } from '../../logger.js';
import { ILogger } from '../../types/interface/logger.interface.js';

/**
 * Abstract base class for transaction analysis services.
 *
 * Provides common functionality:
 * - Date validation
 * - Transaction fetching with error handling
 * - Consistent Result type pattern
 * - Standardized logging
 * - Template method pattern for analysis workflow
 *
 * Subclasses must implement:
 * - analyzeTransactions() - Domain-specific filtering/calculation logic
 * - getOperationName() - For error messages and logging
 */
export abstract class BaseTransactionAnalysisService<TResult> {
    protected readonly logger: ILogger;

    constructor(
        protected readonly transactionService: ITransactionService,
        protected readonly transactionClassificationService: ITransactionClassificationService,
        logger?: ILogger
    ) {
        this.logger = logger ?? defaultLogger;
    }

    /**
     * Template method for transaction analysis workflow.
     * Handles common concerns: validation, fetching, error handling.
     *
     * Subclasses implement analyzeTransactions() for domain-specific logic.
     *
     * @param month - Month to analyze (1-12)
     * @param year - Year to analyze
     * @returns Result containing analysis result or error
     */
    protected async executeAnalysis(
        month: number,
        year: number
    ): Promise<Result<TResult, TransactionAnalysisError>> {
        const operation = this.getOperationName();

        // Step 1: Validate date parameters
        const validationResult = this.validateDate(month, year, operation);
        if (!validationResult.ok) {
            return validationResult;
        }

        // Step 2: Fetch transactions with error handling
        const fetchResult = await this.fetchTransactions(month, year, operation);
        if (!fetchResult.ok) {
            return fetchResult;
        }

        const transactions = fetchResult.value;

        // Step 3: Log fetch success
        this.logger.debug(
            {
                month,
                year,
                operation,
                transactionCount: transactions.length,
            },
            `Fetched transactions for ${operation}`
        );

        // Step 4: Execute domain-specific analysis
        try {
            const result = await this.analyzeTransactions(transactions, month, year);

            this.logger.debug(
                {
                    month,
                    year,
                    operation,
                },
                `${operation} completed successfully`
            );

            return Result.ok(result);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));

            this.logger.error(
                {
                    month,
                    year,
                    operation,
                    error: err.message,
                    errorType: err.constructor.name,
                },
                `${operation} analysis failed`
            );

            return Result.err(
                TransactionAnalysisErrorFactory.create(
                    TransactionAnalysisErrorType.CALCULATION_FAILED,
                    month,
                    year,
                    operation,
                    err
                )
            );
        }
    }

    /**
     * Validates month and year parameters.
     *
     * @returns Result.ok if valid, Result.err with structured error if invalid
     */
    private validateDate(
        month: number,
        year: number,
        operation: string
    ): Result<void, TransactionAnalysisError> {
        try {
            DateUtils.validateMonthYear(month, year);
            return Result.ok(undefined);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));

            this.logger.warn(
                {
                    month,
                    year,
                    operation,
                    error: err.message,
                },
                'Invalid date parameters'
            );

            return Result.err(
                TransactionAnalysisErrorFactory.create(
                    TransactionAnalysisErrorType.INVALID_DATE,
                    month,
                    year,
                    operation,
                    err
                )
            );
        }
    }

    /**
     * Fetches transactions for the given month/year with error handling.
     *
     * @returns Result containing transactions or error
     */
    private async fetchTransactions(
        month: number,
        year: number,
        operation: string
    ): Promise<Result<TransactionSplit[], TransactionAnalysisError>> {
        try {
            const transactions = await this.transactionService.getTransactionsForMonth(month, year);

            if (!transactions || transactions.length === 0) {
                this.logger.debug(
                    {
                        month,
                        year,
                        operation,
                    },
                    'No transactions found for month'
                );

                // Return empty array - not an error, just no data
                return Result.ok([]);
            }

            return Result.ok(transactions);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));

            this.logger.error(
                {
                    month,
                    year,
                    operation,
                    error: err.message,
                    errorType: err.constructor.name,
                },
                'Failed to fetch transactions'
            );

            return Result.err(
                TransactionAnalysisErrorFactory.create(
                    TransactionAnalysisErrorType.FETCH_FAILED,
                    month,
                    year,
                    operation,
                    err
                )
            );
        }
    }

    /**
     * Domain-specific analysis logic implemented by subclasses.
     *
     * @param transactions - Transactions to analyze
     * @param month - Month being analyzed
     * @param year - Year being analyzed
     * @returns Analysis result (type defined by subclass)
     */
    protected abstract analyzeTransactions(
        transactions: TransactionSplit[],
        month: number,
        year: number
    ): Promise<TResult> | TResult;

    /**
     * Operation name for logging and error messages.
     * E.g., "calculateAdditionalIncome", "calculatePaycheckSurplus"
     */
    protected abstract getOperationName(): string;
}
