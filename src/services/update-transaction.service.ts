import {
  BudgetRead,
  Category,
  TransactionSplit,
} from "@derekprovance/firefly-iii-sdk";
import { logger } from "../logger";
import { CategoryService } from "./core/category.service";
import { TransactionService } from "./core/transaction.service";
import { BudgetService } from "./core/budget.service";
import { TransactionPropertyService } from "./core/transaction-property.service";
import {
  AIResponse,
  LLMTransactionProcessingService,
} from "./ai/llm-transaction-processing.service";
import inquirer from "inquirer";
import { UpdateTransactionMode } from "../update-transaction-mode.enum";

interface TransactionCategoryResult {
  name?: string;
  category?: string;
  budget?: string;
  updatedCategory?: string;
  updatedBudget?: string;
}

export class UpdateTransactionService {
  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService,
    private budgetService: BudgetService,
    private transactionProcessingService: LLMTransactionProcessingService,
    private processTransactionsWithCategories = false,
    private noConfirmation = false
  ) {}

  async updateTransactionsByTag(
    tag: string,
    updateMode: UpdateTransactionMode
  ): Promise<TransactionCategoryResult[]> {
    try {
      const [unfilteredTransactions, categories] = await Promise.all([
        this.transactionService.getTransactionsByTag(tag),
        updateMode !== UpdateTransactionMode.Budget
          ? this.categoryService.getCategories()
          : Promise.resolve([]),
      ]);

      const transactions = unfilteredTransactions.filter((t) =>
        this.shouldCategorizeTransaction(t)
      );

      if (!transactions.length) {
        logger.info(`No transactions found for tag: ${tag}`);
        return [];
      }

      let budgets;
      let budgetNames;
      if (updateMode !== UpdateTransactionMode.Category) {
        budgets = await this.budgetService.getBudgets();
        budgetNames = budgets.map((b) => b.attributes.name);
      }

      const categoryNames = categories.map((c) => c.name);
      const aiResults =
        await this.transactionProcessingService.processTransactions(
          transactions,
          updateMode !== UpdateTransactionMode.Budget
            ? categoryNames
            : undefined,
          updateMode !== UpdateTransactionMode.Category
            ? budgetNames
            : undefined
        );

      if (Object.keys(aiResults).length !== transactions.length) {
        throw new Error(
          `LLM categorization result count (${
            Object.keys(aiResults).length
          }) doesn't match transaction count (${transactions.length})`
        );
      }

      const updatedTransactions = await this.updateTransactionsWithAIResults(
        transactions,
        aiResults,
        categories,
        budgets
      );

      return this.mapToResults(updatedTransactions, aiResults);
    } catch (ex) {
      if (ex instanceof Error) {
        logger.error(`Unable to get transactions by tag: ${ex.message}`);
      }

      return [];
    }
  }

  private async updateTransactionsWithAIResults(
    transactions: TransactionSplit[],
    aiResults: AIResponse,
    categories: Category[],
    budgets?: BudgetRead[]
  ): Promise<TransactionSplit[]> {
    const updatedTransactions: TransactionSplit[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      const transactionJournalId = transaction.transaction_journal_id;

      try {
        if (!transactionJournalId) {
          logger.warn(
            `Missing journal ID for transaction: ${transaction.description} (amount: ${transaction.amount})`
          );
          continue;
        }

        if (!aiResults[transactionJournalId]) {
          logger.warn(
            `No AI results found for transaction ${transaction.description} (journal ID: ${transactionJournalId})`
          );
          continue;
        }

        let budget;
        const shouldSetBudget = await this.shouldSetBudget(transaction);
        if (budgets && shouldSetBudget) {
          budget = budgets?.find(
            (budget) =>
              budget.attributes.name === aiResults[transactionJournalId].budget
          );
        }

        const category = categories.find(
          (category) =>
            category?.name === aiResults[transactionJournalId]?.category
        );

        if (
          (transaction.category_name !== category?.name && category?.name) ||
          (transaction.budget_id !== budget?.id && budget?.id)
        ) {
          const answer = await this.askToUpdateTransaction(
            transaction.description,
            category?.name,
            budget?.attributes.name
          );

          if (!answer) {
            logger.debug({
              transaction: transaction.description,
              suggestedCategory: category?.name,
              suggestedBudget: budget?.attributes.name
            }, 'User skipped transaction update');
            continue;
          }

          try {
            await this.transactionService.updateTransaction(
              transaction,
              category?.name,
              budget?.id
            );
            updatedTransactions.push(transaction);
            logger.debug({
              transaction: transaction.description,
              newCategory: category?.name,
              newBudget: budget?.attributes.name
            }, 'Successfully updated transaction');
          } catch (updateError) {
            logger.error({
              error: updateError,
              transaction: transaction.description,
              journalId: transactionJournalId
            }, 'Failed to update transaction');
          }
        }
      } catch (error) {
        logger.error({
          error,
          transaction: transaction.description,
          journalId: transactionJournalId,
          index: i
        }, 'Error processing transaction');
      }
    }
    
    logger.debug({
      totalTransactions: transactions.length,
      updatedCount: updatedTransactions.length
    }, 'Finished processing transactions');
    
    return updatedTransactions;
  }

  private async askToUpdateTransaction(
    description: string,
    category: string | undefined,
    budget: string | undefined
  ): Promise<boolean> {
    if (this.noConfirmation) {
      return true;
    }

    const changes = [
      category && `Category: ${category}`,
      budget && `Budget: ${budget}`,
    ].filter(Boolean);

    const formattedDescription =
      description.length > 50
        ? `${description.substring(0, 47)}...`
        : description;

    const message = [
      `Transaction: "${formattedDescription}"`,
      "Proposed changes:",
      ...changes.map((change) => `  • ${change}`),
      "\nApply these changes?",
    ].join("\n");

    console.log("\n");
    const answer = await inquirer.prompt([
      {
        type: "confirm",
        name: "update",
        message,
        default: true,
      },
    ]);

    return answer.update;
  }

  private shouldCategorizeTransaction(transaction: TransactionSplit): boolean {
    const conditions = {
      notATransfer: !TransactionPropertyService.isTransfer(transaction),
      hasACategory: TransactionPropertyService.hasACategory(transaction),
    };

    return this.processTransactionsWithCategories
      ? conditions.notATransfer
      : conditions.notATransfer && !conditions.hasACategory;
  }

  private async shouldSetBudget(
    transaction: TransactionSplit
  ): Promise<boolean> {
    const isExcludedTransaction =
      await TransactionPropertyService.isExcludedTransaction(
        transaction.description,
        transaction.amount
      );

    const conditions = {
      notABill: !TransactionPropertyService.isABill(transaction),
      notDisposableIncome: !TransactionPropertyService.isDisposableIncome(transaction),
      notAnExcludedTransaction: !isExcludedTransaction,
      notADeposit: !TransactionPropertyService.isDeposit(transaction),
    };

    return (
      conditions.notABill &&
      conditions.notAnExcludedTransaction &&
      conditions.notDisposableIncome &&
      conditions.notADeposit
    );
  }

  private async mapToResults(
    transactions: TransactionSplit[],
    aiResults: AIResponse
  ): Promise<TransactionCategoryResult[]> {
    return Promise.all(
      transactions.map(async (transaction) => {
        const transactionJournalId = transaction.transaction_journal_id;
        if (!transactionJournalId) {
          return {};
        }

        const aiResult = aiResults[transactionJournalId];
        if (!aiResult) {
          return {};
        }

        const shouldSetBudget = await this.shouldSetBudget(transaction);

        return {
          ...(this.shouldCategorizeTransaction(transaction) && {
            name: transaction.description,
            category: transaction.category_name ?? "",
            updatedCategory: aiResult.category,
          }),
          ...(shouldSetBudget && {
            name: transaction.description,
            budget: transaction.budget_name ?? "",
            updatedBudget: aiResult.budget,
          }),
        };
      })
    );
  }
}
