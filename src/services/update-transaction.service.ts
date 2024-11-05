import { BudgetRead, TransactionSplit } from "firefly-iii-sdk";
import { logger } from "../logger";
import { AIResponse, AIService } from "./ai.service";
import { CategoryService } from "./category.service";
import { TransactionService } from "./transaction.service";
import { BudgetService } from "./budget.service";
import { Tag } from "../config";

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

      let budgets: BudgetRead[];
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

      await Promise.all(
        transactions.map((transaction, index) => {
          const aiResult = aiResults[index];
          let budget;
          if (!transaction.tags?.includes(Tag.BILLS)) {
            budget = budgets?.find(
              (budget) => budget.attributes.name === aiResult.budget
            );
          }

          budgets?.find((budget) => budget.attributes.name === aiResult.budget);
          this.transactionService.updateTransaction(
            transaction,
            aiResult.category,
            budget?.id
          );
        })
      );

      return this.mapToResults(transactions, aiResults);
      return [];
    } catch (ex) {
      if (ex instanceof Error) {
        logger.error("Unable to get transactions by tag", ex.message);
      }

      return [];
    }
  }

  /**
   * Maps transactions and AI results to the final result format
   */
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
