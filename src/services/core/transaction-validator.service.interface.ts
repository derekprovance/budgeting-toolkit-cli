import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

export interface ITransactionValidatorService {
    shouldProcessTransaction(transaction: TransactionSplit, force: boolean): boolean;
    isBudgetOnlyCandidate(transaction: TransactionSplit): boolean;
    shouldSetBudget(transaction: TransactionSplit): boolean;
    validateTransactionData(
        transaction: TransactionSplit,
        aiResults: Record<string, { category?: string; budget?: string }>
    ): boolean;
    categoryOrBudgetChanged(
        transaction: TransactionSplit,
        category?: { name: string },
        budget?: { id: string }
    ): boolean;
}
