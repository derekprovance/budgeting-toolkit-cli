import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { TransactionPropertyService } from "./transaction-property.service";
import { logger } from "../../logger";

export class TransactionValidatorService {
    constructor(
        private readonly transactionPropertyService: TransactionPropertyService,
    ) {}

    /**
     * Validates if a transaction should be processed
     * @param transaction The transaction to validate
     * @param processTransactionsWithCategories Whether to process transactions that already have categories
     * @returns True if the transaction should be processed, false otherwise
     */
    shouldProcessTransaction(
        transaction: TransactionSplit,
        processTransactionsWithCategories: boolean,
    ): boolean {
        const conditions = {
            notATransfer:
                !this.transactionPropertyService.isTransfer(transaction),
            hasACategory:
                this.transactionPropertyService.hasACategory(transaction),
        };

        return processTransactionsWithCategories
            ? conditions.notATransfer
            : conditions.notATransfer && !conditions.hasACategory;
    }

    /**
     * Validates if a transaction should have a budget set
     * @param transaction The transaction to validate
     * @returns A promise that resolves to true if the transaction should have a budget, false otherwise
     */
    async shouldSetBudget(transaction: TransactionSplit): Promise<boolean> {
        const isExcludedTransaction =
            await this.transactionPropertyService.isExcludedTransaction(
                transaction.description,
                transaction.amount,
            );

        const conditions = {
            notABill: !this.transactionPropertyService.isBill(transaction),
            notDisposableIncome:
                !this.transactionPropertyService.isDisposableIncome(
                    transaction,
                ),
            notAnExcludedTransaction: !isExcludedTransaction,
            notADeposit:
                !this.transactionPropertyService.isDeposit(transaction),
        };

        return (
            conditions.notABill &&
            conditions.notAnExcludedTransaction &&
            conditions.notDisposableIncome &&
            conditions.notADeposit
        );
    }

    /**
     * Validates if a transaction's data is valid for processing
     * @param transaction The transaction to validate
     * @param aiResults The AI results for the transaction
     * @returns True if the transaction data is valid, false otherwise
     */
    validateTransactionData(
        transaction: TransactionSplit,
        aiResults: Record<string, { category?: string; budget?: string }>,
    ): boolean {
        const journalId = transaction.transaction_journal_id;

        if (!journalId) {
            logger.warn({ description: transaction.description }, "Missing journal ID:");
            return false;
        }

        if (!aiResults[journalId]) {
            logger.warn({ description: transaction.description }, "No AI results found:");
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
        budget?: { id: string },
    ): boolean {
        const hasCategoryChange =
            category?.name && transaction.category_name !== category.name;
        const hasBudgetChange =
            budget?.id && transaction.budget_id !== budget.id;

        return Boolean(hasCategoryChange || hasBudgetChange);
    }
}
