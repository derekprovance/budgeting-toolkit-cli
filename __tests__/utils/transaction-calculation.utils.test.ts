import { describe, it, expect, jest } from '@jest/globals';
import { TransactionCalculationUtils } from '../../src/utils/transaction-calculation.utils.js';
import { logger } from '../../src/logger.js';
import { withdrawal } from '../shared/test-data.js';

describe('TransactionCalculationUtils', () => {
    describe('parseAmountSafe', () => {
        it('should parse plain amounts', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('2000.00')).toBe(2000);
        });

        it('should strip currency symbols', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('$2,000.00')).toBe(2000);
            expect(TransactionCalculationUtils.parseAmountSafe('€2,000.00')).toBe(2000);
            expect(TransactionCalculationUtils.parseAmountSafe('£2,000.00')).toBe(2000);
            expect(TransactionCalculationUtils.parseAmountSafe('¥2,000.00')).toBe(2000);
        });

        it('should handle thousands separators', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('1,234,567.89')).toBe(1234567.89);
        });

        it('should treat accounting parentheses as negative', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('($2,000.00)')).toBe(-2000);
        });

        it('should handle explicit negative amounts', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('-$2,000.00')).toBe(-2000);
        });

        it('should round to 2 decimal places', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('100.126')).toBe(100.13);
        });

        it('should read invalid input as 0', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('invalid')).toBe(0);
            expect(TransactionCalculationUtils.parseAmountSafe('')).toBe(0);
        });
    });

    describe('parseAmount', () => {
        it('should return undefined for anything that is not an amount', () => {
            expect(TransactionCalculationUtils.parseAmount('$123abc')).toBeUndefined();
            expect(TransactionCalculationUtils.parseAmount('')).toBeUndefined();
        });

        it('should parse what parseAmountSafe parses', () => {
            expect(TransactionCalculationUtils.parseAmount('($2,000.00)')).toBe(-2000);
        });
    });

    describe('calculateNetSpend with bad data', () => {
        it('should skip unparseable amounts and warn instead of poisoning the total', () => {
            const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
            const total = TransactionCalculationUtils.calculateNetSpend([
                withdrawal('100'),
                withdrawal('not-a-number'),
                withdrawal('50'),
            ]);
            expect(total).toBe(150);
            expect(warn).toHaveBeenCalledTimes(1);
            warn.mockRestore();
        });
    });
});
