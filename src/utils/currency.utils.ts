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
}
