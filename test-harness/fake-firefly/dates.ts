/**
 * Calendar helpers for the fake server. Everything is a YYYY-MM-DD string in
 * UTC, so plain string comparison orders dates.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** First 10 characters of a date or datetime, validated; throws on junk */
export function toDay(value: unknown): string {
    const match = ISO_DAY.exec(String(value ?? ''));
    if (!match) {
        throw new Error(`Invalid date: ${JSON.stringify(value)}`);
    }
    return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Firefly's wire format for a date-only value */
export function toWireDate(day: string): string {
    return `${day}T00:00:00+00:00`;
}

function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Adds whole months, clamping the day to the target month's length */
export function addMonths(day: string, months: number): string {
    const [y, m, d] = day.split('-').map(Number);
    const total = y * 12 + (m - 1) + months;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`;
}

export function addDays(day: string, days: number): string {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + days));
    return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Inclusive at both ends (V16) */
export function inRange(day: string, start?: string, end?: string): boolean {
    return (start === undefined || day >= start) && (end === undefined || day <= end);
}

/**
 * The n-th occurrence (0-based) of a repeating bill anchored at `anchor`.
 * `skip` repeats every (skip + 1) periods, as Firefly models it.
 */
export function occurrence(anchor: string, repeatFreq: string, skip: number, n: number): string {
    const step = n * (skip + 1);
    switch (repeatFreq) {
        case 'weekly':
            return addDays(anchor, 7 * step);
        case 'monthly':
            return addMonths(anchor, step);
        case 'quarterly':
            return addMonths(anchor, 3 * step);
        case 'half-year':
            return addMonths(anchor, 6 * step);
        case 'yearly':
            return addMonths(anchor, 12 * step);
        default:
            throw new Error(`Unsupported repeat_freq: ${repeatFreq}`);
    }
}
