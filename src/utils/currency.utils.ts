/**
 * Utility functions for currency formatting
 */
export class CurrencyUtils {
    /**
     * Formats a number as currency using Intl.NumberFormat
     * @param amount The amount to format
     * @param currencyCode The ISO 4217 currency code (e.g., 'USD', 'EUR')
     * @param locale The locale to use for formatting (defaults to 'en-US')
     * @returns Formatted currency string
     */
    static format(amount: number, currencyCode = 'USD', locale = 'en-US'): string {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 2,
        }).format(amount);
    }

    /**
     * Formats an amount with a currency symbol (simple format)
     * @param amount The amount to format
     * @param currencySymbol The currency symbol to prepend (e.g., '$', '€')
     * @returns Formatted string like "$123.45"
     */
    static formatWithSymbol(amount: number, currencySymbol: string): string {
        return `${currencySymbol}${Math.abs(amount).toFixed(2)}`;
    }
}
