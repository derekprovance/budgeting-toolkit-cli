import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { LLMTransactionCategoryService } from "./llm-transaction-category.service";
import { LLMTransactionBudgetService } from "./llm-transaction-budget.service";
import { logger } from "../../logger";

interface ITransactionProcessor {
  processTransactions(
    transactions: TransactionSplit[],
    categories: string[],
    budgets?: string[]
  ): Promise<AIResponse[]>;
}

export interface AIResponse {
  category?: string;
  budget?: string;
}

export class LLMTransactionProcessingService implements ITransactionProcessor {
  constructor(
    private llmCategoryService: LLMTransactionCategoryService,
    private llmBudgetService: LLMTransactionBudgetService
  ) {}

  async processTransactions(
    transactions: TransactionSplit[],
    categories?: string[],
    budgets?: string[]
  ): Promise<AIResponse[]> {
    if (!transactions.length) {
      return [];
    }

    const [assignedCategories, assignedBudgets] = await Promise.all([
      categories?.length
        ? this.processCategoriesWithErrorHandling(transactions, categories)
        : Promise.resolve([]),
      budgets?.length
        ? this.processBudgetsWithErrorHandling(
            transactions,
            budgets,
            categories
          )
        : Promise.resolve([]),
    ]);

    return transactions.map((_t, index) => ({
      ...(assignedCategories[index] && { category: assignedCategories[index] }),
      ...(assignedBudgets[index] && { budget: assignedBudgets[index] }),
    }));
  }

  private async processCategoriesWithErrorHandling(
    transactions: TransactionSplit[],
    categories: string[]
  ): Promise<string[]> {
    try {
      return await this.llmCategoryService.categorizeTransactions(
        categories,
        transactions
      );
    } catch (error) {
      logger.error(error, "Unable to assign categories");
      return new Array(transactions.length).fill("");
    }
  }

  private async processBudgetsWithErrorHandling(
    transactions: TransactionSplit[],
    budgets: string[],
    categories?: string[]
  ): Promise<string[]> {
    try {
      return await this.llmBudgetService.assignBudgets(
        budgets,
        transactions,
        categories || []
      );
    } catch (error) {
      logger.error(error, "Unable to assign budgets");
      return new Array(transactions.length).fill("");
    }
  }
}
