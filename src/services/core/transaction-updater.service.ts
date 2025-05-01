import { TransactionSplit, Category, BudgetRead } from "@derekprovance/firefly-iii-sdk";
import { TransactionService } from "./transaction.service";
import { TransactionValidatorService } from "./transaction-validator.service";
import { UserInputService } from "../user-input.service";
import { logger } from "../../logger";

export class TransactionUpdaterService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly validator: TransactionValidatorService,
    private readonly noConfirmation: boolean = false
  ) {}

  /**
   * Updates a transaction with new category and budget
   * @param transaction The transaction to update
   * @param aiResults The AI results for the transaction
   * @param categories Available categories
   * @param budgets Available budgets
   * @returns A promise that resolves to the updated transaction or undefined if not updated
   */
  async updateTransaction(
    transaction: TransactionSplit,
    aiResults: Record<string, { category?: string; budget?: string }>,
    categories?: Category[],
    budgets?: BudgetRead[]
  ): Promise<TransactionSplit | undefined> {
    if (!this.validator.validateTransactionData(transaction, aiResults)) {
      return undefined;
    }

    try {
      const shouldUpdateBudget = await this.validator.shouldSetBudget(transaction);
      const journalId = transaction.transaction_journal_id!;

      let budget;
      if (shouldUpdateBudget) {
        budget = this.getValidBudget(
          budgets,
          aiResults[journalId].budget
        );
      }

      const category = this.getValidCategory(
        categories,
        aiResults[journalId]?.category
      );

      if (!this.validator.categoryOrBudgetChanged(transaction, category, budget)) {
        return undefined;
      }

      const approved = this.noConfirmation || await UserInputService.askToUpdateTransaction(
        transaction,
        category?.name,
        budget?.attributes.name
      );

      if (!approved) {
        logger.debug(
          "User skipped transaction update:",
          transaction.description
        );
        return undefined;
      }

      await this.transactionService.updateTransaction(
        transaction,
        category?.name,
        budget?.id
      );

      logger.debug(
        "Successfully updated transaction:",
        transaction.description
      );

      return transaction;
    } catch (error) {
      logger.error("Error processing transaction:", {
        description: transaction.description,
        error,
      });
      return undefined;
    }
  }

  /**
   * Gets a valid budget from the available budgets
   * @param budgets Available budgets
   * @param value Budget name to find
   * @returns The matching budget or undefined
   */
  private getValidBudget(
    budgets: BudgetRead[] | undefined,
    value: string | undefined
  ): BudgetRead | undefined {
    if (!value) {
      return undefined;
    }

    return budgets?.find((b) => b.attributes.name === value);
  }

  /**
   * Gets a valid category from the available categories
   * @param categories Available categories
   * @param value Category name to find
   * @returns The matching category or undefined
   */
  private getValidCategory(
    categories: Category[] | undefined,
    value: string | undefined
  ): Category | undefined {
    if (!value) {
      return undefined;
    }

    return categories?.find((c) => c?.name === value);
  }
} 