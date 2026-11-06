import { describe, expect, it } from '@jest/globals';
import {
    assertSplitAmounts,
    parseSplitAmount,
    remainderAmount,
    validateSplitAmount,
} from '../../src/utils/split-amount.utils.js';

describe('remainderAmount', () => {
    it('should round the remainder to cents', () => {
        // 100.33 - 60.15 is 40.179999… in binary floating point
        expect(remainderAmount(100.33, 60.15)).toBe(40.18);
    });
});

describe('validateSplitAmount', () => {
    it('should accept an amount between a cent and the original', () => {
        expect(validateSplitAmount('60.50', 100, '$')).toBe(true);
    });

    it('should accept surrounding whitespace', () => {
        expect(validateSplitAmount(' 60 ', 100, '$')).toBe(true);
    });

    it.each(['', '   '])('should require an amount (%p)', value => {
        expect(validateSplitAmount(value, 100, '$')).toBe('Amount is required');
    });

    it.each(['-5', 'abc', '10.505', '1e3'])('should reject %p as malformed', value => {
        expect(validateSplitAmount(value, 100, '$')).toBe(
            'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)'
        );
    });

    it('should reject zero', () => {
        expect(validateSplitAmount('0.00', 100, '$')).toBe('Amount must be greater than zero');
    });

    it('should reject the whole original amount, leaving nothing for the second split', () => {
        expect(validateSplitAmount('50.00', 50, '$')).toBe(
            'Amount must be less than the original amount ($50)'
        );
    });

    it('should reject an amount leaving under a cent for the second split (an original with sub-cent digits)', () => {
        expect(validateSplitAmount('100.00', 100.004, '$')).toBe(
            'Second split would be too small ($0.00). Please enter a smaller amount.'
        );
    });
});

describe('parseSplitAmount', () => {
    it('should return a valid amount as a number', () => {
        expect(parseSplitAmount(' 60.15 ', 100, '$')).toBe(60.15);
    });

    it('should throw the validation message for an invalid amount', () => {
        expect(() => parseSplitAmount('150', 100, '€')).toThrow(
            'Amount must be less than the original amount (€100)'
        );
    });
});

describe('assertSplitAmounts', () => {
    it('should accept parts that sum to the original', () => {
        expect(() => assertSplitAmounts(100, ['60.00', '40.00'], '$')).not.toThrow();
    });

    it('should refuse parts that do not sum to the original to the cent', () => {
        expect(() => assertSplitAmounts(100, ['60.00', '39.99'], '$')).toThrow(
            'Split amounts sum to $99.99, not the original $100.00'
        );
    });

    it('should refuse a part that validateSplitAmount refuses', () => {
        expect(() => assertSplitAmounts(100, ['100.00', '0.00'], '$')).toThrow(
            'Amount must be less than the original amount ($100)'
        );
    });
});
