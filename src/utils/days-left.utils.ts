/**
 * Includes today, which can still be spent: the last day has one day left,
 * not a zero that BudgetDisplayService renders as "budget exhausted". Counted
 * from `today` (local time), not the latest transaction's date, which answers
 * "how stale is my data" instead.
 */
export function daysLeftInMonth(month: number, year: number, today: Date): number {
    const lastDay = new Date(year, month, 0).getDate();
    return Math.max(0, lastDay - today.getDate() + 1);
}
