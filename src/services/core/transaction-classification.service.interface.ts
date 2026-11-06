import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { AccountScope } from './account-scope.service.js';

/** Where a transaction is charged. See RULES.md. */
export const BUCKETS = [
    'paycheck',
    'additionalIncome',
    'bill',
    'disposable',
    'budget',
    'unbudgeted',
] as const;

export type Bucket = (typeof BUCKETS)[number];

/** Implemented by TransactionClassificationService; injected so tests can replace it */
export interface ITransactionClassificationService {
    /**
     * The one bucket a transaction is charged to, or null when it is counted
     * nowhere
     */
    classify(transaction: TransactionSplit, scope: AccountScope): Bucket | null;
    isTransfer(transaction: TransactionSplit): boolean;
    /** Linked to a bill or subscription */
    isBill(transaction: TransactionSplit): boolean;
    isDisposableIncome(transaction: TransactionSplit): boolean;
    isDeposit(transaction: TransactionSplit): boolean;
    /** Firefly returns amounts unsigned, so spending is identified by type, never by sign */
    isWithdrawal(transaction: TransactionSplit): boolean;
    hasCategory(transaction: TransactionSplit): boolean;
    hasBudget(transaction: TransactionSplit): boolean;
    isPaycheck(transaction: TransactionSplit): boolean;
}
