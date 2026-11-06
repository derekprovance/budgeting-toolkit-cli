export interface IExcludedTransactionService {
    isExcludedTransaction(description: string, amount: string): boolean;
}
