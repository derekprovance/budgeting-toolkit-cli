import { TransactionUtils } from '../../src/utils/transaction.utils';
import { createMockTransaction } from '../shared/test-data';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

describe('TransactionUtils', () => {
    describe('calculateTotal', () => {
        it('should calculate total for multiple transactions', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '100.00' }),
                createMockTransaction({ amount: '50.00' }),
                createMockTransaction({ amount: '25.50' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBe(175.5);
        });

        it('should return 0 for empty array', () => {
            const total = TransactionUtils.calculateTotal([]);

            expect(total).toBe(0);
        });

        it('should handle single transaction', () => {
            const transactions: TransactionSplit[] = [createMockTransaction({ amount: '123.45' })];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBe(123.45);
        });

        it('should handle negative amounts', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '100.00' }),
                createMockTransaction({ amount: '-25.00' }),
                createMockTransaction({ amount: '50.00' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBe(125);
        });

        it('should handle all negative amounts', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '-100.00' }),
                createMockTransaction({ amount: '-50.00' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBe(-150);
        });

        it('should handle zero amounts', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '0.00' }),
                createMockTransaction({ amount: '0.00' }),
                createMockTransaction({ amount: '100.00' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBe(100);
        });

        it('should handle decimal precision correctly', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '10.01' }),
                createMockTransaction({ amount: '20.02' }),
                createMockTransaction({ amount: '30.03' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBeCloseTo(60.06, 2);
        });

        it('should handle large amounts', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '9999999.99' }),
                createMockTransaction({ amount: '1.01' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBeCloseTo(10000001, 2);
        });

        it('should handle very small amounts', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '0.01' }),
                createMockTransaction({ amount: '0.02' }),
                createMockTransaction({ amount: '0.03' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBeCloseTo(0.06, 2);
        });

        it('should handle amounts with many decimal places', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '10.123456' }),
                createMockTransaction({ amount: '20.987654' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBeCloseTo(31.11111, 2);
        });

        it('should handle amounts without decimal part', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '100' }),
                createMockTransaction({ amount: '200' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBe(300);
        });

        it('should handle mix of integer and decimal amounts', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '100' }),
                createMockTransaction({ amount: '50.50' }),
                createMockTransaction({ amount: '25' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBe(175.5);
        });

        it('should handle scientific notation amounts', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '1e2' }), // 100
                createMockTransaction({ amount: '5e1' }), // 50
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBe(150);
        });

        it('should handle rounding edge cases', () => {
            // Test floating point precision issues
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '0.1' }),
                createMockTransaction({ amount: '0.2' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            // 0.1 + 0.2 = 0.30000000000000004 in JavaScript
            expect(total).toBeCloseTo(0.3, 10);
        });

        it('should handle many transactions', () => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const transactions: TransactionSplit[] = Array.from({ length: 1000 }, (_, i) =>
                createMockTransaction({ amount: '1.00' })
            );

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBe(1000);
        });

        it('should handle alternating positive and negative amounts', () => {
            const transactions: TransactionSplit[] = [
                createMockTransaction({ amount: '100.00' }),
                createMockTransaction({ amount: '-50.00' }),
                createMockTransaction({ amount: '75.00' }),
                createMockTransaction({ amount: '-25.00' }),
            ];

            const total = TransactionUtils.calculateTotal(transactions);

            expect(total).toBe(100);
        });
    });
});
