import { TransactionRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';

export interface ITransactionService {
    getTransactionsForMonth(month: number, year: number): Promise<TransactionSplit[]>;

    /** Both `YYYY-MM-DD` dates are inclusive */
    getTransactionsInRange(start: string, end: string): Promise<TransactionSplit[]>;

    /** The most recent transaction's date; undefined when the ledger has none */
    getMostRecentTransactionDate(): Promise<Date | undefined>;

    getTransactionsByTag(tag: string): Promise<TransactionSplit[]>;

    tagExists(tag: string): Promise<boolean>;

    updateTransaction(
        transaction: TransactionSplit,
        category?: string,
        budgetId?: string
    ): Promise<TransactionRead>;

    getTransactionReadBySplit(splitTransaction: TransactionSplit): TransactionRead | undefined;
}
