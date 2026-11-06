import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../logger.js';

/**
 * Firefly III 6.6.6 returns `amount` unsigned for every transaction type, so
 * direction comes from `type`. Total a set with `calculateNetSpend` or
 * `calculateNetIncome`; an absolute sum would let a refund inflate the very
 * bucket it should reduce.
 */
export class TransactionCalculationUtils {
    /**
     * Withdrawals and transfers add, deposits (refunds, chargebacks) subtract.
     * Negative when refunds exceed outflows.
     */
    static calculateNetSpend(transactions: TransactionSplit[]): number {
        return TransactionCalculationUtils.sumBySignedType(transactions, 'spend');
    }

    /** The mirror of {@link calculateNetSpend}: deposits and transfers add, withdrawals subtract. */
    static calculateNetIncome(transactions: TransactionSplit[]): number {
        return TransactionCalculationUtils.sumBySignedType(transactions, 'income');
    }

    private static sumBySignedType(
        transactions: TransactionSplit[],
        direction: 'spend' | 'income'
    ): number {
        const positiveType = direction === 'spend' ? 'withdrawal' : 'deposit';
        const negativeType = direction === 'spend' ? 'deposit' : 'withdrawal';

        return transactions.reduce((sum, transaction) => {
            const amount = parseFloat(transaction.amount);
            if (isNaN(amount)) {
                logger.warn({ transaction }, 'Invalid transaction amount found');
                return sum;
            }

            const magnitude = Math.abs(amount);

            if (transaction.type === negativeType) {
                return sum - magnitude;
            }

            if (transaction.type !== positiveType && transaction.type !== 'transfer') {
                logger.debug(
                    { type: transaction.type, description: transaction.description, direction },
                    'Unrecognised transaction type in signed sum - counting toward the total'
                );
            }

            return sum + magnitude;
        }, 0);
    }

    /** {@link parseAmount}, reading an unparseable amount as 0 */
    static parseAmountSafe(amount: string): number {
        return TransactionCalculationUtils.parseAmount(amount) ?? 0;
    }

    /**
     * Parses "$1,234.56" or accounting-style "(50.00)" (negative), rounded to
     * 2 decimals. Returns undefined when the string is not a valid amount.
     */
    static parseAmount(amount: string): number | undefined {
        if (!amount) {
            return undefined;
        }

        const isNegative = amount.includes('(') && amount.includes(')');

        const cleaned = amount
            .replace(/[()]/g, '')
            .replace(/[$€£¥]/g, '')
            .replace(/,/g, '')
            .trim();

        if (!/^-?\d*\.?\d+$/.test(cleaned)) {
            return undefined;
        }

        const parsed = parseFloat(cleaned);
        const finalAmount = isNegative ? -Math.abs(parsed) : parsed;

        return Math.round(finalAmount * 100) / 100;
    }
}
