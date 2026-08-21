import { TransactionRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ILogger } from '../types/interface/logger.interface.js';

/**
 * Utility class for common transaction calculation operations
 */
export class TransactionCalculationUtils {
    /**
     * Flattens Firefly III transaction groups into their individual splits
     */
    static flattenTransactions(transactions: TransactionRead[]): TransactionSplit[] {
        return transactions.flatMap(transaction => transaction.attributes?.transactions ?? []);
    }

    /**
     * Calculates the total of transaction amounts
     * @param transactions Array of transaction splits
     * @param useAbsolute Whether to use absolute values (default: false)
     * @param logger Optional logger for warnings
     * @returns Sum of transaction amounts
     */
    static calculateTransactionTotal(
        transactions: TransactionSplit[],
        useAbsolute: boolean = false,
        logger?: ILogger
    ): number {
        return transactions.reduce((sum, transaction) => {
            const amount = parseFloat(transaction.amount);
            if (isNaN(amount)) {
                logger?.warn({ transaction }, 'Invalid transaction amount found');
                return sum;
            }
            return sum + (useAbsolute ? Math.abs(amount) : amount);
        }, 0);
    }

    /**
     * Safely parses an amount string, handling currency formatting
     * @param amount Amount string to parse
     * @param defaultValue Default value if parsing fails
     * @returns Parsed amount or default value
     */
    static parseAmountSafe(amount: string, defaultValue: number = 0): number {
        const parsed = TransactionCalculationUtils.cleanAmount(amount);
        return parsed ?? defaultValue;
    }

    /**
     * Parses a currency-formatted string ("$1,234.56", "(50.00)") to a number
     * rounded to 2 decimals, or null if the string is not a valid amount.
     * Accounting-style parentheses denote a negative amount.
     */
    private static cleanAmount(amount: string): number | null {
        if (!amount) {
            return null;
        }

        const isNegative = amount.includes('(') && amount.includes(')');

        const cleaned = amount
            .replace(/[()]/g, '')
            .replace(/[$€£¥]/g, '')
            .replace(/,/g, '')
            .trim();

        if (!/^-?\d*\.?\d+$/.test(cleaned)) {
            return null;
        }

        const parsed = parseFloat(cleaned);
        const finalAmount = isNegative ? -Math.abs(parsed) : parsed;

        return Math.round(finalAmount * 100) / 100;
    }
}
