import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionClassificationService } from './transaction-classification.service.interface.js';

export class TransactionClassificationService implements ITransactionClassificationService {
    constructor(
        private readonly noNameExpenseAccountId: string,
        private readonly disposableIncomeTag: string,
        private readonly paycheckTag: string
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

    isPaycheck(transaction: TransactionSplit): boolean {
        if (!transaction.tags) {
            return false;
        }

        return transaction.tags.includes(this.paycheckTag);
    }
}
