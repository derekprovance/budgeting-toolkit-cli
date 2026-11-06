import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../logger.js';

/**
 * Utility class for common transaction calculation operations
 *
 * **Amount sign convention (verified against Firefly III 6.6.6):**
 * - `GET /v1/transactions` returns `amount` **unsigned** — withdrawals,
 *   deposits, and transfers are all positive. Direction comes from `type`,
 *   never from the sign. Never filter spending with `amount < 0`; use
 *   `TransactionClassificationService.isWithdrawal()`.
 *
 * Because direction lives in `type`, total a set with `calculateNetSpend` or
 * `calculateNetIncome`; an absolute sum would let a refund inflate the very
 * bucket it should reduce.
 */
export class TransactionCalculationUtils {
    /**
     * Sums a set of transactions as *spending*, honouring direction.
     *
     * Firefly reports `amount` unsigned, so direction has to come from `type`:
     * withdrawals and transfers add to the total, and deposits (refunds,
     * chargebacks, returned payments) subtract from it.
     *
     * @returns Net spend; negative when refunds exceed outflows
     */
    static calculateNetSpend(transactions: TransactionSplit[]): number {
        return TransactionCalculationUtils.sumBySignedType(transactions, 'spend');
    }

    /**
     * Sums a set of transactions as *income*, honouring direction.
     *
     * The mirror of {@link calculateNetSpend}: deposits and transfers add,
     * withdrawals subtract. The income buckets hold only deposits today; the
     * signs keep a total honest if that ever changes.
     */
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
     * Parses a currency-formatted string ("$1,234.56", "(50.00)") to a number
     * rounded to 2 decimals. Accounting-style parentheses denote a negative
     * amount.
     *
     * @returns undefined when the string is not a valid amount
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
