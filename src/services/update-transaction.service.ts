import {
  BudgetRead,
  Category,
  TransactionSplit,
} from "@derekprovance/firefly-iii-sdk";
import { logger } from "../logger";
import { AIResponse, AIService } from "./ai/ai.service";
import { CategoryService } from "./core/category.service";
import { TransactionService } from "./core/transaction.service";
import { BudgetService } from "./core/budget.service";
import { TransactionProperty } from "./core/transaction-property.service";

interface TransactionCategoryResult {
  name: string;
  category: string;
  budget?: string;
}

export class UpdateTransactionService {
  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService,
    private budgetService: BudgetService,
    private aiService: AIService
  ) {}

  async updateTransactionsByTag(
    tag: string,
    updateBudget = false
  ): Promise<TransactionCategoryResult[]> {
    try {
      const [transactions, categories] = await Promise.all([
        this.transactionService.getTransactionsByTag(tag),
        this.categoryService.getCategories(),
      ]);

      if (!transactions.length) {
        logger.info(`No transactions found for tag: ${tag}`);
        return [];
      }

      let budgets: BudgetRead[] = [];
      let budgetNames;
      if (updateBudget) {
        budgets = await this.budgetService.getBudgets();
        budgetNames = budgets.map((b) => b.attributes.name);
      }

      const categoryNames = categories.map((c) => c.name);

      const aiResults = await this.aiService.processTransactions(
        transactions,
        categoryNames,
        budgetNames
      );

      if (aiResults.length !== transactions.length) {
        throw new Error(
          `AI categorization result count (${aiResults.length}) doesn't match transaction count (${transactions.length})`
        );
      }

      this.updateTransactionsWithAIResults(
        transactions,
        aiResults,
        categories,
        budgets
      );
      return this.mapToResults(transactions, aiResults);
    } catch (ex) {
      if (ex instanceof Error) {
        logger.error("Unable to get transactions by tag", ex.message);
      }

      return [];
    }
  }

  private updateTransactionsWithAIResults(
    transactions: TransactionSplit[],
    aiResults: AIResponse[],
    categories: Category[],
    budgets?: BudgetRead[]
  ) {
    transactions.map(async (transaction, index) => {
      const aiResult = aiResults[index];

      let budget;
      if (this.shouldSetBudget(transaction)) {
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

      await this.transactionService.updateTransaction(
        transaction,
        category?.name,
        budget?.id
      );
    });
  }

  private shouldCategorizeTransaction(transaction: TransactionSplit): boolean {
    if (TransactionProperty.isABill(transaction)) {
      return false;
    }

    if (TransactionProperty.isTransfer(transaction)) {
      return false;
    }

    return true;
  }

  private shouldSetBudget(transaction: TransactionSplit): boolean {
    if (TransactionProperty.isABill(transaction)) {
      return false;
    }

    if (TransactionProperty.isDisposableIncome(transaction)) {
      return false;
    }

    if (TransactionProperty.isInvestmentDeposit(transaction)) {
      return false;
    }

    return true;
  }

  private mapToResults(
    transactions: TransactionSplit[],
    aiResults: AIResponse[]
  ): TransactionCategoryResult[] {
    return transactions.map((transaction, index) => ({
      name: transaction.description,
      category: aiResults[index].category,
      budget: aiResults[index].budget,
    }));
  }
}
