import { BillRead } from '@derekprovance/firefly-iii-sdk';
import { Day, daysInMonth, formatDay, monthRange, shiftMonth, toDay } from './date.utils.js';
import { logger } from '../logger.js';

/**
 * Every date a bill falls due in a month, from its own schedule.
 *
 * Firefly's `pay_dates` cannot answer this: it lists only the occurrences after
 * the latest payment in the window (V11), so a weekly bill half paid reports
 * half its due dates. The schedule is the bill's start date stepped every
 * (skip + 1) periods, with a month-end day clamped to shorter months without
 * drifting (Jan 31 → Feb 28 → Mar 31). Verified against Firefly 6.6.6 (V21).
 */
export function dueDatesInMonth(bill: BillRead, month: number, year: number): Day[] {
    const start = toDay(bill.attributes.date);
    const period = PERIODS[bill.attributes.repeat_freq ?? ''];
    if (!start || !period) {
        return [];
    }

    const { start: first, end: last } = monthRange(month, year);
    const end = toDay(bill.attributes.end_date);
    const stride = (bill.attributes.skip ?? 0) + 1;

    const dates: Day[] = [];
    for (let n = 0; ; n++) {
        const date = period(start, n * stride);
        if (date > last || (end && date > end)) {
            return dates;
        }
        if (date >= first) {
            dates.push(date);
        }
    }
}

/**
 * The unpaid due dates Firefly reports for this month, in order.
 *
 * `pay_dates` is payment-aware: it lists only the occurrences after the
 * latest payment in the window, and falls back to the next one outside it
 * (V11). So it says what is still owed, not what fell due; the month's
 * schedule comes from {@link dueDatesInMonth} instead.
 */
export function unpaidDatesInMonth(bill: BillRead, month: number, year: number): Day[] {
    const { start, end } = monthRange(month, year);
    return (bill.attributes.pay_dates ?? [])
        .map(toDay)
        .filter((day): day is Day => day !== null && day >= start && day <= end)
        .sort();
}

/**
 * What one payment of a bill is expected to cost: `amount_avg`, else the
 * midpoint of `amount_min` and `amount_max`. Display-only (R-BILL-1). An
 * unreadable or negative amount expects nothing.
 */
export function expectedBillAmount(bill: BillRead): number {
    const amount = parseExpectedAmount(bill.attributes);
    if (isNaN(amount) || amount < 0) {
        const { amount_avg, amount_min, amount_max } = bill.attributes;
        logger.debug(
            { billId: bill.id, billName: bill.attributes.name, amount_avg, amount_min, amount_max },
            'Invalid bill amount, defaulting to 0'
        );
        return 0;
    }
    return amount;
}

function parseExpectedAmount({
    amount_avg,
    amount_min,
    amount_max,
}: BillRead['attributes']): number {
    if (amount_avg) {
        return parseFloat(amount_avg);
    }
    const min = parseFloat(amount_min ?? '0');
    const max = amount_max == null ? min : parseFloat(amount_max);
    return (min + max) / 2;
}

const PERIODS: Record<string, (start: Day, steps: number) => Day> = {
    weekly: (start, steps) => addDays(start, 7 * steps),
    monthly: (start, steps) => addMonths(start, steps),
    quarterly: (start, steps) => addMonths(start, 3 * steps),
    'half-year': (start, steps) => addMonths(start, 6 * steps),
    yearly: (start, steps) => addMonths(start, 12 * steps),
};

function addMonths(day: Day, months: number): Day {
    const [y, m, d] = day.split('-').map(Number);
    const { month, year } = shiftMonth(m, y, months);
    return formatDay(year, month, Math.min(d, daysInMonth(year, month)));
}

function addDays(day: Day, days: number): Day {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + days));
    return formatDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}
