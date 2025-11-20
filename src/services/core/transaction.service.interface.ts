import { TransactionRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';

/**
 * Interface for TransactionService
 * Enables dependency injection and testing without mocking ESM modules
 */
export interface ITransactionService {
    /**
     * Retrieves transactions for a specific month, using cache when available
     */
    getTransactionsForMonth(month: number, year: number): Promise<TransactionSplit[]>;

    /**
     * Gets the most recent transaction date
     */
    getMostRecentTransactionDate(): Promise<Date | null>;

    /**
     * Retrieves transactions by tag
     */
    getTransactionsByTag(tag: string): Promise<TransactionSplit[]>;

    /**
     * Checks if a tag exists
     */
    tagExists(tag: string): Promise<boolean>;

    /**
     * Updates a transaction with category and/or budget
     */
    updateTransaction(
        transaction: TransactionSplit,
        category?: string,
        budgetId?: string
    ): Promise<TransactionRead | undefined>;

    /**
     * Gets the full TransactionRead object for a given split transaction
     */
    getTransactionReadBySplit(splitTransaction: TransactionSplit): TransactionRead | undefined;

    /**
     * Clears the transaction cache
     */
    clearCache(): void;
}
