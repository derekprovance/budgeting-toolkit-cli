import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

/**
 * Utility functions for transaction operations
 */
export class TransactionUtils {
    /**
     * Calculates the total amount from an array of transactions
     * @param transactions Array of transaction splits
     * @returns Total amount as a number
     */
    calculateTotal(transactions: TransactionSplit[]): number {
        return transactions.reduce((sum, transaction) => sum + parseFloat(transaction.amount), 0);
    }
}
