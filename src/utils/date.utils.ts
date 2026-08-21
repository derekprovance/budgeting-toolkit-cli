import { Result } from '../types/result.type.js';
import { logger } from '../logger.js';

export class DateUtils {
    static validateMonthYear(month: number, year: number): void {
        if (!Number.isInteger(month) || month < 1 || month > 12) {
            throw new Error('Month must be an integer between 1 and 12');
        }
        if (!Number.isInteger(year) || year < 1900 || year > 9999) {
            throw new Error('Year must be a valid 4-digit year');
        }
    }

    /**
     * Validates month/year and wraps a failure in the caller's error type.
     *
     * @param errorFactory Builds the domain error from the validation failure
     * @returns Result.ok when valid, Result.err(errorFactory(...)) otherwise
     */
    static validateMonthYearResult<E>(
        month: number,
        year: number,
        operation: string,
        errorFactory: (month: number, year: number, operation: string, error: Error) => E
    ): Result<void, E> {
        try {
            DateUtils.validateMonthYear(month, year);
            return Result.ok(undefined);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.warn({ month, year, operation, error: err.message }, 'Invalid date parameters');
            return Result.err(errorFactory(month, year, operation, err));
        }
    }
}
