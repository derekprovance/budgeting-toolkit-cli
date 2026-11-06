/**
 * Days left in the month, counted from `today` and INCLUDING today.
 *
 * Today is a day you can still spend, so the last day of the month has one
 * day left, not zero. Excluding it divided the remaining budget by one day
 * too few every day, and on the final day produced a zero that
 * BudgetDisplayService renders as "budget exhausted" no matter how much is
 * actually left.
 *
 * Deliberately not derived from the most recent transaction's date: that
 * answers "how stale is my data", not "how long do I have", and using it
 * reported 12 days left on the 24th of a 31-day month.
 *
 * @param month 1-12
 * @param today A date inside that month, in local time
 */
export function daysLeftInMonth(month: number, year: number, today: Date): number {
    const lastDay = new Date(year, month, 0).getDate();
    return Math.max(0, lastDay - today.getDate() + 1);
}
