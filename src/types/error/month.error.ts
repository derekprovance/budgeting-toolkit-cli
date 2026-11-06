import { logger } from '../../logger.js';
import { Result } from '../result.type.js';
import { toError } from '../../utils/error-detection.utils.js';

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

/** `failed` is absent where the cause already names the month and the reason */
const MESSAGES: Record<
    MonthErrorKind,
    (period: string) => { failed?: string; userMessage: string }
> = {
    TRANSACTIONS_FETCH_FAILED: period => ({
        userMessage: `Unable to retrieve transactions for ${period}. Please check your connection and try again.`,
    }),
    BUCKETS_FAILED: period => ({
        failed: `Calculation failed for getBuckets on ${period}`,
        userMessage: `An error occurred while calculating results for ${period}. Please try again or contact support.`,
    }),
    BILL_COMPARISON_FAILED: period => ({
        failed: `Bill comparison calculation failed for calculateBillComparison on ${period}`,
        userMessage: `An error occurred while calculating bill comparison for ${period}. Please try again.`,
    }),
    BUDGET_REPORT_FAILED: period => ({
        failed: `Budget calculation failed for getBudgetReport on ${period}`,
        userMessage: `An error occurred while calculating budget data for ${period}. Please try again.`,
    }),
};

/** Logs the failure and returns it as a failed Result. */
export function monthFailure<T>(
    kind: MonthErrorKind,
    { month, year }: { month: number; year: number },
    error: unknown
): Result<T, MonthError> {
    const cause = toError(error);
    const { failed, userMessage } = MESSAGES[kind](`${month}/${year}`);
    const monthError: MonthError = {
        kind,
        message: failed ? `${failed}: ${cause.message}` : cause.message,
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
