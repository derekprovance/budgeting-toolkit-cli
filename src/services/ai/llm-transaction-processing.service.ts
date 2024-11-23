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
  category: string;
  budget?: string;
}

export class LLMTransactionProcessingService implements ITransactionProcessor {
  constructor(
    private llmCategoryService: LLMTransactionCategoryService,
    private llmBudgetService: LLMTransactionBudgetService
  ) {}

  async processTransactions(
    transactions: TransactionSplit[],
    categories: string[],
    budgets?: string[]
  ): Promise<AIResponse[]> {
    const assignedCategories =
      await this.llmCategoryService.categorizeTransactions(
        categories,
        transactions
      );

    if (!budgets?.length) {
      return assignedCategories.map((category) => ({ category }));
    }

    let assignedBudgets: string[] = [];
    try {
      assignedBudgets = await this.llmBudgetService.assignBudgets(
        budgets,
        transactions,
        assignedCategories
      );
    } catch (ex) {
      logger.error(ex, `Unable to assign buckets`);
    }

    return assignedCategories.map((category, index) => ({
      category,
      ...(assignedBudgets[index] ? { budget: assignedBudgets[index] } : {}),
    }));
  }
}
