import { CurrencyUtils } from '../../src/utils/currency.utils.js';

describe('CurrencyUtils', () => {
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
