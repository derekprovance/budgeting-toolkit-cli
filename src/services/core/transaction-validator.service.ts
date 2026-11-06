import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionClassificationService } from './transaction-classification.service.interface.js';
import { ITransactionValidatorService } from './transaction-validator.service.interface.js';

export class TransactionValidatorService implements ITransactionValidatorService {
    constructor(
        private readonly transactionClassificationService: ITransactionClassificationService
    ) {}

    /** @param force also process transactions that already have a category and budget */
    shouldProcessTransaction(transaction: TransactionSplit, force: boolean): boolean {
        const conditions = {
            notATransfer: !this.transactionClassificationService.isTransfer(transaction),
            hasACategory: this.transactionClassificationService.hasCategory(transaction),
            hasBudget: this.transactionClassificationService.hasBudget(transaction),
        };

        return force
            ? conditions.notATransfer
            : conditions.notATransfer && (!conditions.hasACategory || !conditions.hasBudget);
    }

    isBudgetOnlyCandidate(transaction: TransactionSplit): boolean {
        return (
            this.transactionClassificationService.hasCategory(transaction) &&
            !this.transactionClassificationService.hasBudget(transaction)
        );
    }

    shouldSetBudget(transaction: TransactionSplit): boolean {
        const conditions = {
            notABill: !this.transactionClassificationService.isBill(transaction),
            notDisposableIncome:
                !this.transactionClassificationService.isDisposableIncome(transaction),
            notADeposit: !this.transactionClassificationService.isDeposit(transaction),
        };

        return conditions.notABill && conditions.notDisposableIncome && conditions.notADeposit;
    }

    categoryOrBudgetChanged(
        transaction: TransactionSplit,
        category?: { name: string },
        budget?: { id: string }
    ): boolean {
        const hasCategoryChange = category?.name && transaction.category_name !== category.name;
        const hasBudgetChange = budget?.id && transaction.budget_id !== budget.id;

        return Boolean(hasCategoryChange || hasBudgetChange);
    }
}
