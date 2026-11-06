import { logger } from '../../logger.js';
import { Result } from '../result.type.js';

/** What could not be produced for a month */
export type MonthErrorKind =
    | 'TRANSACTIONS_FETCH_FAILED'
    | 'BUCKETS_FAILED'
    | 'BILL_COMPARISON_FAILED'
    | 'BUDGET_REPORT_FAILED';

export interface MonthError {
    readonly kind: MonthErrorKind;
    /** What failed and why, for the log and the CLI's error line */
    readonly message: string;
    /** What to tell the user */
    readonly userMessage: string;
    readonly month: number;
    readonly year: number;
    readonly cause: Error;
}

const MESSAGES: Record<MonthErrorKind, (month: number) => { failed: string; userMessage: string }> =
    {
        TRANSACTIONS_FETCH_FAILED: month => ({
            failed: `Failed to fetch transactions for month ${month}`,
            userMessage: `Unable to retrieve transactions for month ${month}. Please check your connection and try again.`,
        }),
        BUCKETS_FAILED: month => ({
            failed: `Calculation failed for getBuckets on month ${month}`,
            userMessage: `An error occurred while calculating results for month ${month}. Please try again or contact support.`,
        }),
        BILL_COMPARISON_FAILED: month => ({
            failed: `Bill comparison calculation failed for calculateBillComparison on month ${month}`,
            userMessage: `An error occurred while calculating bill comparison for month ${month}. Please try again.`,
        }),
        BUDGET_REPORT_FAILED: month => ({
            failed: `Budget calculation failed for getBudgetReport on month ${month}`,
            userMessage: `An error occurred while calculating budget data for month ${month}. Please try again.`,
        }),
    };

/**
 * Logs why a month's figures could not be produced and returns that as a
 * failed Result, for services whose callers branch on the outcome.
 */
export function monthFailure<T>(
    kind: MonthErrorKind,
    { month, year }: { month: number; year: number },
    error: unknown
): Result<T, MonthError> {
    const cause = error instanceof Error ? error : new Error(String(error));
    const { failed, userMessage } = MESSAGES[kind](month);
    const monthError: MonthError = {
        kind,
        message: `${failed}: ${cause.message}`,
        userMessage,
        month,
        year,
        cause,
    };

    logger.error(
        { kind, month, year, error: cause.message, errorType: cause.constructor.name },
        monthError.message
    );
    return Result.err(monthError);
}
