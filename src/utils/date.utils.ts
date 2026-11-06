/** A calendar day as YYYY-MM-DD; plain string comparison orders these */
export type Day = string;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Ignores any offset in a Firefly date or datetime. */
export function toDay(value: string | null | undefined): Day | null {
    const match = ISO_DAY.exec(value ?? '');
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * The local calendar day. Not `toISOString()`, which converts to UTC and
 * shifts local midnight to the previous day in UTC+ timezones.
 */
export function localDay(date: Date): Day {
    return formatDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * Inclusive, as Firefly's date filters take them. Every month query is built
 * here, so this is where an impossible month is rejected.
 *
 * @throws Error when `month` is not 1–12 or `year` is not a four-digit year
 */
export function monthRange(month: number, year: number): { start: Day; end: Day } {
    assertValidMonth(month, year);
    return {
        start: formatDay(year, month, 1),
        end: formatDay(year, month, daysInMonth(year, month)),
    };
}

/** @throws Error when `month` is not 1–12 or `year` is not a four-digit year */
export function assertValidMonth(month: number, year: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Month must be an integer between 1 and 12');
    }
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
        throw new Error('Year must be a valid 4-digit year');
    }
}

export function shiftMonth(
    month: number,
    year: number,
    by: number
): { month: number; year: number } {
    const total = year * 12 + (month - 1) + by;
    return { month: (total % 12) + 1, year: Math.floor(total / 12) };
}

export function formatDay(year: number, month: number, day: number): Day {
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Includes today, which can still be spent: the last day has one day left,
 * not a zero that BudgetDisplayService renders as "budget exhausted". Counted
 * from `today` (local time), not the latest transaction's date, which answers
 * "how stale is my data" instead.
 */
export function daysLeftInMonth(month: number, year: number, today: Date): number {
    return Math.max(0, daysInMonth(year, month) - today.getDate() + 1);
}
