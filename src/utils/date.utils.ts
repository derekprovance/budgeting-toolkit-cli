import { Result } from '../types/result.type.js';
import { logger } from '../logger.js';

/** A calendar day as YYYY-MM-DD; plain string comparison orders these */
export type Day = string;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** The calendar day a Firefly date or datetime names, ignoring any offset */
export function toDay(value: string | null | undefined): Day | null {
    const match = ISO_DAY.exec(value ?? '');
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * The calendar day `date` falls on in local time, as the owner's calendar
 * sees it. Not `toISOString()`, which converts to UTC and shifts local
 * midnight to the previous day in UTC+ timezones.
 */
export function localDay(date: Date): Day {
    return formatDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** The first and last day of a month, inclusive, as Firefly's date filters take them */
export function monthRange(month: number, year: number): { start: Day; end: Day } {
    return {
        start: formatDay(year, month, 1),
        end: formatDay(year, month, daysInMonth(year, month)),
    };
}

export function formatDay(year: number, month: number, day: number): Day {
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

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
