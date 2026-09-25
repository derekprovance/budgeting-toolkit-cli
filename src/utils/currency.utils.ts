/**
 * Utility functions for currency formatting
 */
export class CurrencyUtils {
    /**
     * Formats an amount with a currency symbol (simple format)
     * @param amount The amount to format
     * @param currencySymbol The currency symbol to prepend (e.g., '$', '€')
     * @returns Formatted string like "$123.45"
     */
    static formatWithSymbol(amount: number, currencySymbol: string): string {
        return `${currencySymbol}${Math.abs(amount).toFixed(2)}`;
    }

    /** Like {@link formatWithSymbol}, but a negative amount keeps its minus sign */
    static formatSigned(amount: number, currencySymbol: string): string {
        const cents = CurrencyUtils.toCents(amount);
        return `${cents < 0 ? '-' : ''}${CurrencyUtils.formatWithSymbol(cents, currencySymbol)}`;
    }

    /**
     * Rounds a value to two decimal places, half away from zero, and never
     * returns `-0`.
     *
     * The epsilon absorbs binary floating-point noise (`360.505 * 100` is
     * `36050.49999…`) so a value that is a true half-cent rounds the way a person
     * would. It is far below a cent, so it cannot move any real amount.
     */
    static toCents(value: number): number {
        const rounded = (Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-7)) / 100;
        return rounded === 0 ? 0 : rounded;
    }
}
