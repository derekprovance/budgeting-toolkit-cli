import { ExcludedTransactionDto } from '../types/dto/excluded-transaction.dto.js';

/**
 * Interface for ExcludedTransactionService
 * Enables dependency injection and testing without mocking ESM modules
 */
export interface IExcludedTransactionService {
    /**
     * Gets all excluded transactions
     */
    getExcludedTransactions(): Promise<ExcludedTransactionDto[]>;

    /**
     * Checks if a transaction should be excluded based on description and amount
     */
    isExcludedTransaction(description: string, amount: string): Promise<boolean>;
}
