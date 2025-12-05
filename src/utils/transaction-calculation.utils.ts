import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ILogger } from '../types/interface/logger.interface.js';

/**
 * Utility class for common transaction calculation operations
 */
export class TransactionCalculationUtils {
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
     * Parses a transaction amount to a number
     * @param transaction Transaction split
     * @param logger Optional logger for warnings
     * @returns Parsed amount or NaN if invalid
     */
    static parseTransactionAmount(transaction: TransactionSplit, logger?: ILogger): number {
        const amount = parseFloat(transaction.amount);
        if (isNaN(amount)) {
            logger?.warn({ transaction }, 'Invalid transaction amount found');
        }
        return amount;
    }

    /**
     * Safely parses an amount string, handling currency formatting
     * @param amount Amount string to parse
     * @param defaultValue Default value if parsing fails
     * @returns Parsed amount or default value
     */
    static parseAmountSafe(amount: string, defaultValue: number = 0): number {
        if (!amount) {
            return defaultValue;
        }

        const isNegative = amount.includes('(') && amount.includes(')');

        const cleanAmount = amount
            .replace(/[()]/g, '')
            .replace(/[$€£¥]/g, '')
            .replace(/,/g, '')
            .trim();

        if (!/^-?\d*\.?\d+$/.test(cleanAmount)) {
            return defaultValue;
        }

        const parsedAmount = parseFloat(cleanAmount);
        const finalAmount = isNegative ? -Math.abs(parsedAmount) : parsedAmount;

        return Math.round(finalAmount * 100) / 100;
    }

    /**
     * Converts currency string to float string with validation
     * @param amount Currency string
     * @returns Formatted float string with 2 decimals
     * @throws Error if amount is invalid
     */
    static convertCurrencyToFloat(amount: string): string {
        if (!amount) {
            throw new Error('Amount cannot be empty');
        }

        const isNegative = amount.includes('(') && amount.includes(')');

        const cleanAmount = amount
            .replace(/[()]/g, '')
            .replace(/[$€£¥]/g, '')
            .replace(/,/g, '')
            .trim();

        if (!/^-?\d*\.?\d+$/.test(cleanAmount)) {
            throw new Error(`Invalid amount format: ${amount}`);
        }

        const parsedAmount = parseFloat(cleanAmount);
        const finalAmount = isNegative ? -Math.abs(parsedAmount) : parsedAmount;

        return (Math.round(finalAmount * 100) / 100).toFixed(2);
    }
}
