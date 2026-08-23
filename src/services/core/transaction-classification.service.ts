import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionClassificationService } from './transaction-classification.service.interface.js';

export class TransactionClassificationService implements ITransactionClassificationService {
    constructor(
        private readonly noNameExpenseAccountId: string,
        private readonly disposableIncomeTag: string,
        private readonly paycheckTag: string,
        /**
         * Accounts a paycheck-tagged transaction must be destined for. Empty
         * means the tag alone decides.
         */
        private readonly paycheckDestinationAccounts: string[] = []
    ) {}

    isTransfer(transaction: TransactionSplit): boolean {
        return transaction.type === 'transfer';
    }

    isBill(transaction: TransactionSplit): boolean {
        return !!(transaction.bill_id || transaction.subscription_id);
    }

    isDisposableIncome(transaction: TransactionSplit): boolean {
        if (!transaction.tags) {
            return false;
        }

        return transaction.tags.includes(this.disposableIncomeTag);
    }

    isSupplementedByDisposable(tags: string[] | null | undefined): boolean {
        return tags?.includes(this.disposableIncomeTag) ?? false;
    }

    isDeposit(transaction: TransactionSplit): boolean {
        return transaction.type === 'deposit';
    }

    isWithdrawal(transaction: TransactionSplit): boolean {
        return transaction.type === 'withdrawal';
    }

    hasACategory(transaction: TransactionSplit): boolean {
        return !(transaction.category_id === undefined || transaction.category_id === null);
    }

    hasBudget(transaction: TransactionSplit): boolean {
        return !(transaction.budget_id === undefined || transaction.budget_id === null);
    }

    /**
     * A paycheck is tagged with the configured paycheck tag AND, when
     * `paycheckDestinationAccounts` is configured, lands in one of those
     * accounts.
     *
     * The account check exists because a payroll deposit is often split across
     * accounts, and a stray tag on the half that is not the paycheck would
     * charge that money to the paycheck bucket. Constraining it here rather
     * than in the callers keeps the precedence rule intact: the same predicate
     * decides what PaycheckSurplusService counts and what AdditionalIncomeService
     * steps aside for, so a rejected transaction falls through to additional
     * income rather than disappearing from both.
     *
     * Left empty the tag alone decides, which is the behaviour for anyone who
     * has not configured the accounts.
     */
    isPaycheck(transaction: TransactionSplit): boolean {
        if (!transaction.tags?.includes(this.paycheckTag)) {
            return false;
        }

        if (this.paycheckDestinationAccounts.length === 0) {
            return true;
        }

        return (
            !!transaction.destination_id &&
            this.paycheckDestinationAccounts.includes(transaction.destination_id)
        );
    }
}
