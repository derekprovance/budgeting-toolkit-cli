import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { LLMTransactionCategoryService } from "./llm-transaction-category.service";
import { LLMTransactionBudgetService } from "./llm-transaction-budget.service";
import { logger } from "../../logger";

interface ITransactionProcessor {
  processTransactions(
    transactions: TransactionSplit[],
    categories: string[],
    budgets?: string[]
  ): Promise<AIResponse>;
}

export interface AIResult {
  category?: string;
  budget?: string;
}
export interface AIResponse {
  [key: string]: AIResult;
}

interface TransactionBatch {
  transactions: TransactionSplit[];
  indices: number[];
}

export class LLMTransactionProcessingService implements ITransactionProcessor {
  private readonly BATCH_SIZE = 5;
  private readonly SIMILARITY_THRESHOLD = 0.7;

  constructor(
    private llmCategoryService: LLMTransactionCategoryService,
    private llmBudgetService: LLMTransactionBudgetService
  ) {}

  async processTransactions(
    transactions: TransactionSplit[],
    categories?: string[],
    budgets?: string[]
  ): Promise<AIResponse> {
    if (!transactions.length) {
      return {};
    }

    logger.trace(
      {
        transactionCount: transactions.length,
        categoryCount: categories?.length || 0,
        budgetCount: budgets?.length || 0,
        transactions: transactions.map((t) => ({
          id: t.transaction_journal_id,
          description: t.description,
          amount: t.amount,
        })),
      },
      "Starting transaction processing"
    );

    // Create batches of similar transactions
    const categoryBatches = categories?.length
      ? this.createTransactionBatches(transactions)
      : [];
    const budgetBatches = budgets?.length
      ? this.createTransactionBatches(transactions)
      : [];

    logger.trace(
      {
        categoryBatchCount: categoryBatches.length,
        budgetBatchCount: budgetBatches.length,
        categoryBatches: categoryBatches.map((batch) => ({
          indices: batch.indices,
          transactions: batch.transactions.map((t) => ({
            id: t.transaction_journal_id,
            description: t.description,
          })),
        })),
        budgetBatches: budgetBatches.map((batch) => ({
          indices: batch.indices,
          transactions: batch.transactions.map((t) => ({
            id: t.transaction_journal_id,
            description: t.description,
          })),
        })),
      },
      "Created transaction batches"
    );

    // Process categories first
    const assignedCategories = categories?.length
      ? await this.processCategoriesWithErrorHandling(
          transactions,
          categories,
          categoryBatches
        )
      : [];

    logger.trace(
      {
        transactionResults: transactions.map((t, i) => ({
          id: t.transaction_journal_id,
          description: t.description,
          assignedCategory: assignedCategories[i],
        })),
      },
      "Category assignment complete"
    );

    // Then process budgets using the assigned categories
    const assignedBudgets =
      budgets?.length && categories?.length
        ? await this.processBudgetsWithErrorHandling(
            transactions,
            budgets,
            assignedCategories,
            budgetBatches
          )
        : [];

    logger.trace(
      {
        transactionResults: transactions.map((t, i) => ({
          id: t.transaction_journal_id,
          description: t.description,
          assignedCategory: assignedCategories[i],
          assignedBudget: assignedBudgets[i],
        })),
      },
      "Budget assignment complete"
    );

    const result = transactions.reduce((acc, t, index) => {
      acc[t.transaction_journal_id || ""] = {
        ...(assignedCategories[index] && {
          category: assignedCategories[index],
        }),
        ...(assignedBudgets[index] && { budget: assignedBudgets[index] }),
      };
      return acc;
    }, {} as AIResponse);

    logger.trace(
      {
        results: Object.entries(result).map(([id, value]) => ({
          id,
          ...value,
          transaction: transactions.find((t) => t.transaction_journal_id === id)
            ?.description,
        })),
      },
      "Final transaction processing results"
    );

    return result;
  }

  private createTransactionBatches(
    transactions: TransactionSplit[]
  ): TransactionBatch[] {
    const batches: TransactionBatch[] = [];
    const processedIndices = new Set<number>();

    for (let i = 0; i < transactions.length; i++) {
      if (processedIndices.has(i)) continue;

      const currentBatch: TransactionBatch = {
        transactions: [transactions[i]],
        indices: [i],
      };
      processedIndices.add(i);

      // Find similar transactions
      for (let j = i + 1; j < transactions.length; j++) {
        if (processedIndices.has(j)) continue;
        if (currentBatch.transactions.length >= this.BATCH_SIZE) break;

        const similarity = this.calculateTransactionSimilarity(
          transactions[i],
          transactions[j]
        );

        if (similarity >= this.SIMILARITY_THRESHOLD) {
          currentBatch.transactions.push(transactions[j]);
          currentBatch.indices.push(j);
          processedIndices.add(j);
        }
      }

      batches.push(currentBatch);
    }

    return batches;
  }

  private calculateTransactionSimilarity(
    tx1: TransactionSplit,
    tx2: TransactionSplit
  ): number {
    if (!tx1.description || !tx2.description) return 0.0;

    const desc1 = tx1.description.toLowerCase();
    const desc2 = tx2.description.toLowerCase();

    // Check for payment platforms
    const paymentPlatforms = ["venmo", "paypal", "cash app", "zelle"];
    const isPlatform1 = paymentPlatforms.some((p) => desc1.includes(p));
    const isPlatform2 = paymentPlatforms.some((p) => desc2.includes(p));

    // If both are payment platform transactions
    if (isPlatform1 && isPlatform2) {
      // If they're from the same platform
      if (
        paymentPlatforms.some((p) => desc1.includes(p) && desc2.includes(p))
      ) {
        // Extract recipient names
        const recipient1 = desc1
          .split(/(?:to|from)\s+/)[1]
          ?.split(/\s+on\s+|\s+via\s+/)[0]
          ?.trim();
        const recipient2 = desc2
          .split(/(?:to|from)\s+/)[1]
          ?.split(/\s+on\s+|\s+via\s+/)[0]
          ?.trim();

        // If same recipient, high similarity
        if (recipient1 && recipient2 && recipient1 === recipient2) {
          return 1.0;
        }

        // If similar amounts (within 20%), medium similarity
        const amount1 = Math.abs(parseFloat(tx1.amount));
        const amount2 = Math.abs(parseFloat(tx2.amount));
        if (!isNaN(amount1) && !isNaN(amount2)) {
          const amountDiff =
            Math.abs(amount1 - amount2) / Math.max(amount1, amount2);
          if (amountDiff <= 0.2) return 0.6;
        }
      }

      // Different platforms or recipients, low similarity
      return 0.3;
    }

    // If only one is a payment platform transaction, very low similarity
    if (isPlatform1 || isPlatform2) {
      return 0.1;
    }

    // For non-platform transactions, use original logic
    const merchant1 = desc1.split(" ")[0];
    const merchant2 = desc2.split(" ")[0];

    // Check if same merchant
    if (merchant1 === merchant2) return 1.0;

    // Check if similar amounts (within 20%)
    const amount1 = Math.abs(parseFloat(tx1.amount));
    const amount2 = Math.abs(parseFloat(tx2.amount));
    if (isNaN(amount1) || isNaN(amount2)) return 0.0;

    const amountDiff = Math.abs(amount1 - amount2) / Math.max(amount1, amount2);
    if (amountDiff <= 0.2) return 0.8;

    return 0.0;
  }

  private async processCategoriesWithErrorHandling(
    transactions: TransactionSplit[],
    categories: string[],
    batches: TransactionBatch[]
  ): Promise<string[]> {
    try {
      const results = new Array(transactions.length).fill("");

      for (const batch of batches) {
        logger.trace(
          {
            batchSize: batch.transactions.length,
            batchIndices: batch.indices,
            batchTransactions: batch.transactions.map((t) => ({
              id: t.transaction_journal_id,
              description: t.description,
            })),
          },
          "Processing category batch"
        );

        const batchResults =
          await this.llmCategoryService.categorizeTransactions(
            categories,
            batch.transactions
          );

        logger.trace(
          {
            batchIndices: batch.indices,
            batchResults: batch.transactions.map((t, i) => ({
              id: t.transaction_journal_id,
              description: t.description,
              assignedCategory: batchResults[i],
            })),
          },
          "Category batch results received"
        );

        // Map batch results back to original indices
        batchResults.forEach((result, batchIndex) => {
          results[batch.indices[batchIndex]] = result;
        });
      }

      logger.trace(
        {
          finalResults: transactions.map((t, i) => ({
            id: t.transaction_journal_id,
            description: t.description,
            assignedCategory: results[i],
          })),
        },
        "All category batches processed"
      );

      return results;
    } catch (error) {
      logger.error({ error }, "Unable to assign categories");
      return new Array(transactions.length).fill("");
    }
  }

  private async processBudgetsWithErrorHandling(
    transactions: TransactionSplit[],
    budgets: string[],
    assignedCategories: string[],
    batches?: TransactionBatch[]
  ): Promise<string[]> {
    try {
      const results = new Array(transactions.length).fill("");

      for (const batch of batches || []) {
        // Get categories for just this batch
        const batchCategories = batch.indices.map(
          (index) => assignedCategories[index] || ""
        );

        logger.trace(
          {
            batchSize: batch.transactions.length,
            batchIndices: batch.indices,
            batchTransactions: batch.transactions.map((t, i) => ({
              id: t.transaction_journal_id,
              description: t.description,
              category: batchCategories[i],
            })),
          },
          "Processing budget batch"
        );

        const batchResults = await this.llmBudgetService.assignBudgets(
          budgets,
          batch.transactions,
          batchCategories
        );

        logger.trace(
          {
            batchIndices: batch.indices,
            batchResults: batch.transactions.map((t, i) => ({
              id: t.transaction_journal_id,
              description: t.description,
              category: batchCategories[i],
              assignedBudget: batchResults[i],
            })),
          },
          "Budget batch results received"
        );

        // Map batch results back to original indices
        batchResults.forEach((result, batchIndex) => {
          results[batch.indices[batchIndex]] = result;
        });
      }

      logger.trace(
        {
          finalResults: transactions.map((t, i) => ({
            id: t.transaction_journal_id,
            description: t.description,
            category: assignedCategories[i],
            assignedBudget: results[i],
          })),
        },
        "All budget batches processed"
      );

      return results;
    } catch (error) {
      logger.error({ error }, "Unable to assign budgets");
      return new Array(transactions.length).fill("");
    }
  }
}
