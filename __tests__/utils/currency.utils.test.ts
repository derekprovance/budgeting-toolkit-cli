import { CurrencyUtils } from '../../src/utils/currency.utils.js';

describe('CurrencyUtils', () => {
    describe('format', () => {
        it('should format USD currency with default locale', () => {
            const result = CurrencyUtils.format(1234.56, 'USD');

            expect(result).toBe('$1,234.56');
        });

        it('should format EUR currency', () => {
            const result = CurrencyUtils.format(1234.56, 'EUR', 'en-US');

            expect(result).toBe('€1,234.56');
        });

        it('should format GBP currency', () => {
            const result = CurrencyUtils.format(1234.56, 'GBP', 'en-US');

            expect(result).toBe('£1,234.56');
        });

        it('should format with different locale (de-DE)', () => {
            const result = CurrencyUtils.format(1234.56, 'EUR', 'de-DE');

            // German locale uses comma for decimal separator and period for thousands
            // Different environments may have different spacing
            expect(result).toMatch(/1\.234,56\s*€/);
        });

        it('should format with different locale (fr-FR)', () => {
            const result = CurrencyUtils.format(1234.56, 'EUR', 'fr-FR');

            // French locale formatting
            expect(result).toContain('1');
            expect(result).toContain('234');
            expect(result).toContain('56');
            expect(result).toContain('€');
        });

        it('should format zero amount', () => {
            const result = CurrencyUtils.format(0, 'USD');

            expect(result).toBe('$0.00');
        });

        it('should format negative amount', () => {
            const result = CurrencyUtils.format(-1234.56, 'USD');

            expect(result).toBe('-$1,234.56');
        });

        it('should format large amount', () => {
            const result = CurrencyUtils.format(9999999.99, 'USD');

            expect(result).toBe('$9,999,999.99');
        });

        it('should format small decimal amount', () => {
            const result = CurrencyUtils.format(0.99, 'USD');

            expect(result).toBe('$0.99');
        });

        it('should enforce minimum 2 decimal places', () => {
            const result = CurrencyUtils.format(100, 'USD');

            expect(result).toBe('$100.00');
        });

        it('should round to 2 decimal places', () => {
            const result = CurrencyUtils.format(123.456, 'USD');

            expect(result).toBe('$123.46');
        });

        it('should handle very small amounts', () => {
            const result = CurrencyUtils.format(0.01, 'USD');

            expect(result).toBe('$0.01');
        });

        it('should handle amounts with many decimal places', () => {
            const result = CurrencyUtils.format(123.999999, 'USD');

            expect(result).toBe('$124.00');
        });

        it('should use default USD when no currency provided', () => {
            const result = CurrencyUtils.format(100);

            expect(result).toBe('$100.00');
        });

        it('should use default en-US locale when no locale provided', () => {
            const result = CurrencyUtils.format(1234.56, 'USD');

            expect(result).toBe('$1,234.56');
        });

        it('should format JPY (currency without decimal places)', () => {
            const result = CurrencyUtils.format(1234, 'JPY', 'en-US');

            // JPY typically shows as ¥1,234 (no decimals), but our format enforces 2 decimals
            expect(result).toBe('¥1,234.00');
        });

        it('should handle scientific notation input', () => {
            const result = CurrencyUtils.format(1.23e3, 'USD');

            expect(result).toBe('$1,230.00');
        });

        it('should handle negative zero', () => {
            const result = CurrencyUtils.format(-0, 'USD');

            // Some environments may format -0 as "-$0.00" or "$0.00"
            expect(result).toMatch(/^-?\$0\.00$/);
        });

        it('should handle Infinity gracefully', () => {
            const result = CurrencyUtils.format(Infinity, 'USD');

            // Intl.NumberFormat returns '∞' or locale-specific infinity symbol
            expect(result).toContain('∞');
        });

        it('should handle NaN gracefully', () => {
            const result = CurrencyUtils.format(NaN, 'USD');

            // Intl.NumberFormat returns 'NaN' or locale-specific not-a-number
            expect(result).toContain('NaN');
        });
    });

    describe('formatWithSymbol', () => {
        it('should format with dollar symbol', () => {
            const result = CurrencyUtils.formatWithSymbol(100.0, '$');

            expect(result).toBe('$100.00');
        });

        it('should format with euro symbol', () => {
            const result = CurrencyUtils.formatWithSymbol(100.0, '€');

            expect(result).toBe('€100.00');
        });

        it('should format with pound symbol', () => {
            const result = CurrencyUtils.formatWithSymbol(100.0, '£');

            expect(result).toBe('£100.00');
        });

        it('should use absolute value for negative amounts', () => {
            const result = CurrencyUtils.formatWithSymbol(-100.5, '$');

            expect(result).toBe('$100.50');
        });

        it('should format zero amount', () => {
            const result = CurrencyUtils.formatWithSymbol(0, '$');

            expect(result).toBe('$0.00');
        });

        it('should format decimal amounts correctly', () => {
            const result = CurrencyUtils.formatWithSymbol(123.456, '$');

            expect(result).toBe('$123.46');
        });

        it('should round to 2 decimal places', () => {
            const result = CurrencyUtils.formatWithSymbol(99.999, '$');

            expect(result).toBe('$100.00');
        });

        it('should handle large amounts', () => {
            const result = CurrencyUtils.formatWithSymbol(9999999.99, '$');

            expect(result).toBe('$9999999.99');
        });

        it('should handle small amounts', () => {
            const result = CurrencyUtils.formatWithSymbol(0.01, '$');

            expect(result).toBe('$0.01');
        });

        it('should format amounts without thousand separators', () => {
            const result = CurrencyUtils.formatWithSymbol(1234.56, '$');

            // formatWithSymbol doesn't add thousand separators
            expect(result).toBe('$1234.56');
            expect(result).not.toContain(',');
        });

        it('should handle custom symbols', () => {
            const result = CurrencyUtils.formatWithSymbol(100, 'USD ');

            expect(result).toBe('USD 100.00');
        });

        it('should handle empty symbol', () => {
            const result = CurrencyUtils.formatWithSymbol(100, '');

            expect(result).toBe('100.00');
        });

        it('should handle multi-character symbols', () => {
            const result = CurrencyUtils.formatWithSymbol(100, 'CAD$');

            expect(result).toBe('CAD$100.00');
        });

        it('should always show 2 decimal places', () => {
            const result = CurrencyUtils.formatWithSymbol(100, '$');

            expect(result).toBe('$100.00');
        });

        it('should handle negative zero', () => {
            const result = CurrencyUtils.formatWithSymbol(-0, '$');

            expect(result).toBe('$0.00');
        });

        it('should handle very large positive number', () => {
            const result = CurrencyUtils.formatWithSymbol(99999999999.99, '$');

            expect(result).toBe('$99999999999.99');
        });

        it('should convert negative amounts to positive', () => {
            const result = CurrencyUtils.formatWithSymbol(-123.45, '$');

            expect(result).toBe('$123.45');
            expect(result).not.toContain('-');
        });

        it('should handle amounts with many decimal places', () => {
            const result = CurrencyUtils.formatWithSymbol(123.9876543, '$');

            expect(result).toBe('$123.99');
        });

        it('should handle integer amounts', () => {
            const result = CurrencyUtils.formatWithSymbol(100, '$');

            expect(result).toBe('$100.00');
        });
    });
});
