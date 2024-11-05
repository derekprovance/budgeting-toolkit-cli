import { TransactionSplit } from "firefly-iii-sdk";
import { logger } from "../logger";
import { AIService } from "./ai.service";
import { CategoryService } from "./category.service";
import { TransactionService } from "./transaction.service";

interface TransactionCategoryResult {
  name: string;
  category: string;
}

export class UpdateTransactionService {
  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService,
    private aiService: AIService
  ) {}

  async updateCategoriesByTag(
    tag: string
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

      const categoryNames = categories.map((c) => c.name);

      const aiResults = await this.aiService.categorizeTransactions(
        categoryNames,
        transactions
      );

      if (aiResults.length !== transactions.length) {
        throw new Error(
          `AI categorization result count (${aiResults.length}) doesn't match transaction count (${transactions.length})`
        );
      }

      await Promise.all(
        transactions.map((transaction, index) =>
          this.transactionService.updateTransactionWithCategory(
            transaction,
            aiResults[index].trim()
          )
        )
      );

      return this.mapToResults(transactions, aiResults);
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
    categories: string[]
  ): TransactionCategoryResult[] {
    return transactions.map((transaction, index) => ({
      name: transaction.description,
      category: categories[index].trim(),
    }));
  }
}
