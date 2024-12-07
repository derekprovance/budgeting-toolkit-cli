import {
  BudgetRead,
  Category,
  TransactionSplit,
} from "@derekprovance/firefly-iii-sdk";
import { logger } from "../logger";
import { CategoryService } from "./core/category.service";
import { TransactionService } from "./core/transaction.service";
import { BudgetService } from "./core/budget.service";
import { TransactionProperty } from "./core/transaction-property.service";
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

      if (aiResults.length !== transactions.length) {
        throw new Error(
          `AI categorization result count (${aiResults.length}) doesn't match transaction count (${transactions.length})`
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
    aiResults: AIResponse[],
    categories: Category[],
    budgets?: BudgetRead[]
  ): Promise<TransactionSplit[]> {
    const updatedTransactions: TransactionSplit[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      const aiResult = aiResults[i];

      let budget;
      if (budgets && this.shouldSetBudget(transaction)) {
        budget = budgets?.find(
          (budget) => budget.attributes.name === aiResult.budget
        );

        if (!budget) {
          logger.info(
            `Errant Budget Result from AI ${aiResult.budget} for transaction: ${transaction.description}`
          );
        }
      }

      const category = categories.find(
        (category) => category?.name === aiResult.category
      );

      if (!category) {
        logger.info(
          `Errant Category Result from AI ${aiResult.category} for transaction: ${transaction.description}`
        );
      }

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
          logger.debug(
            `Skipping transaction ${transaction.description} due to user input`
          );
          continue;
        }

        await this.transactionService.updateTransaction(
          transaction,
          category?.name,
          budget?.id
        );

        updatedTransactions.push(transaction);
      }
    }

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
      notATransfer: !TransactionProperty.isTransfer(transaction),
      hasACategory: TransactionProperty.hasACategory(transaction),
    };

    return this.processTransactionsWithCategories
      ? conditions.notATransfer
      : conditions.notATransfer && !conditions.hasACategory;
  }

  private shouldSetBudget(transaction: TransactionSplit): boolean {
    const conditions = {
      notABill: !TransactionProperty.isABill(transaction),
      notDisposableIncome: !TransactionProperty.isDisposableIncome(transaction),
      notAnInvestment: !TransactionProperty.isInvestmentDeposit(transaction),
    };

    return (
      conditions.notABill &&
      conditions.notAnInvestment &&
      conditions.notDisposableIncome
    );
  }

  private mapToResults(
    transactions: TransactionSplit[],
    aiResults: AIResponse[]
  ): TransactionCategoryResult[] {
    return transactions.map((transaction, index) => {
      const aiResult = aiResults[index];

      return {
        ...(this.shouldCategorizeTransaction(transaction) && {
          name: transaction.description,
          category: transaction.category_name ?? "",
          updatedCategory: aiResult.category,
        }),
        ...(this.shouldSetBudget(transaction) && {
          name: transaction.description,
          budget: transaction.budget_name ?? "",
          updatedBudget: aiResult.budget,
        }),
      };
    });
  }
}
