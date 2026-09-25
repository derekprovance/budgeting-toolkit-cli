import { BillRead } from '@derekprovance/firefly-iii-sdk';

/** A calendar day as YYYY-MM-DD; plain string comparison orders these */
export type Day = string;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** The calendar day a Firefly date or datetime names, ignoring any offset */
export function toDay(value: string | null | undefined): Day | null {
    const match = ISO_DAY.exec(value ?? '');
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** Today in local time, as the owner's calendar sees it */
export function today(now: Date = new Date()): Day {
    return formatDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

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

    const first = formatDay(year, month, 1);
    const last = formatDay(year, month, daysInMonth(year, month));
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

const PERIODS: Record<string, (start: Day, steps: number) => Day> = {
    weekly: (start, steps) => addDays(start, 7 * steps),
    monthly: (start, steps) => addMonths(start, steps),
    quarterly: (start, steps) => addMonths(start, 3 * steps),
    'half-year': (start, steps) => addMonths(start, 6 * steps),
    yearly: (start, steps) => addMonths(start, 12 * steps),
};

function addMonths(day: Day, months: number): Day {
    const [y, m, d] = day.split('-').map(Number);
    const total = y * 12 + (m - 1) + months;
    const year = Math.floor(total / 12);
    const month = (total % 12) + 1;
    return formatDay(year, month, Math.min(d, daysInMonth(year, month)));
}

function addDays(day: Day, days: number): Day {
    const [y, m, d] = day.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + days));
    return formatDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDay(year: number, month: number, day: number): Day {
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}
