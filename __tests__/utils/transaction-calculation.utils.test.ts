import { describe, it, expect, jest } from '@jest/globals';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { TransactionCalculationUtils } from '../../src/utils/transaction-calculation.utils.js';
import { ILogger } from '../../src/types/interface/logger.interface.js';

const txn = (amount: string): TransactionSplit => ({ amount }) as TransactionSplit;

describe('TransactionCalculationUtils', () => {
    describe('parseAmountSafe', () => {
        it('should parse plain amounts', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('4400.00')).toBe(4400);
        });

        it('should strip currency symbols', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('$4,400.00')).toBe(4400);
            expect(TransactionCalculationUtils.parseAmountSafe('€4,400.00')).toBe(4400);
            expect(TransactionCalculationUtils.parseAmountSafe('£4,400.00')).toBe(4400);
            expect(TransactionCalculationUtils.parseAmountSafe('¥4,400.00')).toBe(4400);
        });

        it('should handle thousands separators', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('1,234,567.89')).toBe(1234567.89);
        });

        it('should treat accounting parentheses as negative', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('($4,400.00)')).toBe(-4400);
        });

        it('should handle explicit negative amounts', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('-$4,400.00')).toBe(-4400);
        });

        it('should round to 2 decimal places', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('100.126')).toBe(100.13);
        });

        it('should return the default for invalid input', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('invalid')).toBe(0);
            expect(TransactionCalculationUtils.parseAmountSafe('$123abc', -1)).toBe(-1);
            expect(TransactionCalculationUtils.parseAmountSafe('')).toBe(0);
        });

        it('should support NaN as a default for never-equal matching', () => {
            expect(TransactionCalculationUtils.parseAmountSafe('garbage', NaN)).toBeNaN();
        });
    });

    describe('calculateTransactionTotal', () => {
        it('should sum signed amounts by default', () => {
            const total = TransactionCalculationUtils.calculateTransactionTotal([
                txn('100.50'),
                txn('-40.25'),
            ]);
            expect(total).toBeCloseTo(60.25);
        });

        it('should sum absolute values when requested', () => {
            const total = TransactionCalculationUtils.calculateTransactionTotal(
                [txn('100.50'), txn('-40.25')],
                true
            );
            expect(total).toBeCloseTo(140.75);
        });

        it('should skip unparseable amounts and warn instead of poisoning the total', () => {
            const logger = { warn: jest.fn() } as unknown as ILogger;
            const total = TransactionCalculationUtils.calculateTransactionTotal(
                [txn('100'), txn('not-a-number'), txn('50')],
                true,
                logger
            );
            expect(total).toBe(150);
            expect(logger.warn).toHaveBeenCalledTimes(1);
        });
    });
});
