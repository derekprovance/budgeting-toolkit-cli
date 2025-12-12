import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

/**
 * Interface for TransactionClassificationService
 * Enables dependency injection and testing without mocking ESM modules
 */
export interface ITransactionClassificationService {
    /**
     * Checks if transaction is a transfer
     */
    isTransfer(transaction: TransactionSplit): boolean;

    /**
     * Checks if transaction is linked to a bill (bill_id or subscription_id is set)
     */
    isBill(transaction: TransactionSplit): boolean;

    /**
     * Checks if transaction is tagged as disposable income
     */
    isDisposableIncome(transaction: TransactionSplit): boolean;

    /**
     * Checks if destination account matches the "no name" expense account
     */
    hasNoDestination(destinationId: string | null): boolean;

    /**
     * Checks if transaction is supplemented by disposable income
     */
    isSupplementedByDisposable(tags: string[] | null | undefined): boolean;

    /**
     * Checks if transaction is in the excluded transactions list
     */
    isExcludedTransaction(description: string, amount: string): Promise<boolean>;

    /**
     * Checks if transaction is a deposit
     */
    isDeposit(transaction: TransactionSplit): boolean;

    /**
     * Checks if transaction has a category assigned
     */
    hasACategory(transaction: TransactionSplit): boolean;

    /**
     * Checks if transaction is tagged as a paycheck
     */
    isPaycheck(transaction: TransactionSplit): boolean;
}
