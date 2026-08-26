import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionClassificationService } from './transaction-classification.service.interface.js';

export class TransactionClassificationService implements ITransactionClassificationService {
    constructor(
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
     * than in the callers keeps one predicate deciding both what
     * PaycheckSurplusService counts and what AdditionalIncomeService steps
     * aside for, so the two cannot both claim a transaction.
     *
     * Rejection here is NOT a promotion to additional income. A rejected
     * transaction reaches that bucket only if it independently passes
     * AdditionalIncomeService's own filters. Three cases where it will not, and
     * the money is charged to no income bucket at all:
     *
     * - its destination is an untracked account. This is the current setup: the
     *   savings half of payroll lands outside the tracked boundary, so it is
     *   deliberately counted nowhere. Money outside the boundary belongs in no
     *   bucket — do not "fix" this by widening the scope.
     * - it is a transfer. AdditionalIncomeService requires a deposit. Also the
     *   right outcome — a transfer between accounts the owner already holds is
     *   not income — but a paycheck-tagged transfer is silently uncounted.
     * - its description matches `excludedAdditionalIncomePatterns`. Prefer the
     *   account boundary over a description pattern; see CLAUDE.md.
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
