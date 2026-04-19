import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionClassificationService } from './transaction-classification.service.interface.js';
import { logger } from '../../logger.js';
import { ITransactionValidatorService } from './transaction-validator.service.interface.js';

export class TransactionValidatorService implements ITransactionValidatorService {
    constructor(
        private readonly transactionClassificationService: ITransactionClassificationService
    ) {}

    /**
     * Validates if a transaction should be processed
     * @param transaction The transaction to validate
     * @param force Whether to force processing of transactions that are fully classified
     * @returns True if the transaction should be processed, false otherwise
     */
    shouldProcessTransaction(transaction: TransactionSplit, force: boolean): boolean {
        const conditions = {
            notATransfer: !this.transactionClassificationService.isTransfer(transaction),
            hasACategory: this.transactionClassificationService.hasACategory(transaction),
            hasBudget: this.transactionClassificationService.hasBudget(transaction),
        };

        return force
            ? conditions.notATransfer
            : conditions.notATransfer && (!conditions.hasACategory || !conditions.hasBudget);
    }

    /**
     * Checks if a transaction is a budget-only candidate (has category but no budget)
     * @param transaction The transaction to check
     * @returns True if transaction has category but no budget, false otherwise
     */
    isBudgetOnlyCandidate(transaction: TransactionSplit): boolean {
        return (
            this.transactionClassificationService.hasACategory(transaction) &&
            !this.transactionClassificationService.hasBudget(transaction)
        );
    }

    /**
     * Validates if a transaction should have a budget set
     * @param transaction The transaction to validate
     * @returns True if the transaction should have a budget, false otherwise
     */
    shouldSetBudget(transaction: TransactionSplit): boolean {
        const conditions = {
            notABill: !this.transactionClassificationService.isBill(transaction),
            notDisposableIncome:
                !this.transactionClassificationService.isDisposableIncome(transaction),
            notADeposit: !this.transactionClassificationService.isDeposit(transaction),
        };

        return conditions.notABill && conditions.notDisposableIncome && conditions.notADeposit;
    }

    /**
     * Validates if a transaction's data is valid for processing
     * @param transaction The transaction to validate
     * @param aiResults The AI results for the transaction
     * @returns True if the transaction data is valid, false otherwise
     */
    validateTransactionData(
        transaction: TransactionSplit,
        aiResults: Record<string, { category?: string; budget?: string }>
    ): boolean {
        const journalId = transaction.transaction_journal_id;

        if (!journalId) {
            logger.warn({ description: transaction.description }, 'Missing journal ID:');
            return false;
        }

        if (!aiResults[journalId]) {
            logger.warn({ description: transaction.description }, 'No AI results found:');
            return false;
        }

        return true;
    }

    /**
     * Checks if a transaction's category or budget has changed
     * @param transaction The transaction to check
     * @param category The new category
     * @param budget The new budget
     * @returns True if either the category or budget has changed, false otherwise
     */
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
