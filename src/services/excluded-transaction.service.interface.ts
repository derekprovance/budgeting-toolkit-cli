/**
 * Interface for ExcludedTransactionService
 * Enables dependency injection and testing without mocking ESM modules
 */
export interface IExcludedTransactionService {
    /**
     * Checks if a transaction should be excluded based on description and amount
     */
    isExcludedTransaction(description: string, amount: string): boolean;
}
