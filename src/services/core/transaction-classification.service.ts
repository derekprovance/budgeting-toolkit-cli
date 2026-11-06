import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import {
    Bucket,
    ITransactionClassificationService,
} from './transaction-classification.service.interface.js';
import { AccountScope } from './account-scope.service.js';

/**
 * Decides which bucket a transaction belongs to. RULES.md is the authority for
 * every rule here; the rule ids in the comments point at it.
 */
export class TransactionClassificationService implements ITransactionClassificationService {
    constructor(
        private readonly disposableIncomeTag: string,
        private readonly paycheckTag: string
    ) {}

    /**
     * The one bucket a transaction is charged to, or null when it is counted
     * nowhere. Every command totals the same buckets, so this is the only
     * place a transaction's treatment is decided.
     */
    classify(transaction: TransactionSplit, scope: AccountScope): Bucket | null {
        const fromEnvelope = isIn(scope.envelope, transaction.source_id);
        const toEnvelope = isIn(scope.envelope, transaction.destination_id);

        switch (transaction.type) {
            case 'withdrawal':
                // R-SCOPE-2: a marker never pulls an outside withdrawal in
                return fromEnvelope ? this.bucketByMarker(transaction) : null;

            case 'transfer':
                // R-XFER-1/2: inside or inbound is ignored. R-XFER-3: outbound
                // is unbudgeted; Firefly keeps no bill or budget on a transfer.
                return fromEnvelope && !toEnvelope ? 'unbudgeted' : null;

            case 'deposit': {
                if (!toEnvelope) {
                    return null; // R-INCOME-2
                }

                const intoIncomeAccount = isIn(scope.income, transaction.destination_id);
                if (intoIncomeAccount && this.isPaycheck(transaction)) {
                    return 'paycheck'; // R-INCOME-1
                }

                // R-REFUND-1: a marked deposit, or any deposit onto a card,
                // reduces a spending bucket rather than counting as income
                if (this.isMarked(transaction) || !intoIncomeAccount) {
                    return this.bucketByMarker(transaction);
                }

                return 'additionalIncome'; // R-INCOME-1
            }

            default:
                return null;
        }
    }

    isTransfer(transaction: TransactionSplit): boolean {
        return transaction.type === 'transfer';
    }

    isBill(transaction: TransactionSplit): boolean {
        return billIdOf(transaction) !== undefined;
    }

    isDisposableIncome(transaction: TransactionSplit): boolean {
        return transaction.tags?.includes(this.disposableIncomeTag) ?? false;
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
        return !!transaction.budget_id;
    }

    /**
     * Carries the paycheck tag. Where it landed is {@link classify}'s concern:
     * the stray tag on the savings half of payroll is rejected there because
     * savings is outside the envelope.
     */
    isPaycheck(transaction: TransactionSplit): boolean {
        return transaction.tags?.includes(this.paycheckTag) ?? false;
    }

    /** R-BUCKET-1: bill, then disposable, then budget; the first match wins */
    private bucketByMarker(transaction: TransactionSplit): Bucket {
        if (this.isBill(transaction)) return 'bill';
        if (this.isDisposableIncome(transaction)) return 'disposable';
        if (this.hasBudget(transaction)) return 'budget';
        return 'unbudgeted';
    }

    private isMarked(transaction: TransactionSplit): boolean {
        return this.bucketByMarker(transaction) !== 'unbudgeted';
    }
}

/** The bill or subscription a transaction is linked to, if any */
export function billIdOf(transaction: TransactionSplit): string | undefined {
    return transaction.bill_id || transaction.subscription_id || undefined;
}

function isIn(accounts: ReadonlySet<string>, id: string | null | undefined): boolean {
    return !!id && accounts.has(id);
}
