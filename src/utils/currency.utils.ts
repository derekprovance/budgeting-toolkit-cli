/** The currency assumed when Firefly names none, as for a month with no bills */
export const DEFAULT_CURRENCY = { code: 'USD', symbol: '$' } as const;

export class CurrencyUtils {
    /** Drops the sign; see {@link formatSigned}. */
    static formatWithSymbol(amount: number, currencySymbol: string): string {
        return `${currencySymbol}${Math.abs(amount).toFixed(2)}`;
    }

    static formatSigned(amount: number, currencySymbol: string): string {
        const cents = CurrencyUtils.toCents(amount);
        return `${cents < 0 ? '-' : ''}${CurrencyUtils.formatWithSymbol(cents, currencySymbol)}`;
    }

    /**
     * Rounds half away from zero and never returns `-0`. The epsilon absorbs
     * float noise (`360.505 * 100` is `36050.49999…`) so a true half-cent rounds
     * up; it is far below a cent, so it cannot move a real amount.
     */
    static toCents(value: number): number {
        const rounded = (Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-7)) / 100;
        return rounded === 0 ? 0 : rounded;
    }
}
