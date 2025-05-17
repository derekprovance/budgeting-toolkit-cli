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

    logger.debug(
      {
        transactionCount: transactions.length,
        categoryCount: categories?.length || 0,
        budgetCount: budgets?.length || 0,
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

    logger.debug(
      {
        categoryBatchCount: categoryBatches.length,
        budgetBatchCount: budgetBatches.length,
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

    // Then process budgets using the assigned categories
    const assignedBudgets =
      budgets?.length
        ? await this.processBudgetsWithErrorHandling(
            transactions,
            budgets,
            assignedCategories,
            budgetBatches
          )
        : [];

    const result = transactions.reduce((acc, t, index) => {
      acc[t.transaction_journal_id || ""] = {
        ...(assignedCategories[index] && {
          category: assignedCategories[index],
        }),
        ...(assignedBudgets[index] && { budget: assignedBudgets[index] }),
      };
      return acc;
    }, {} as AIResponse);

    logger.debug(
      {
        processedCount: Object.keys(result).length,
        categoryCount: Object.values(result).filter(r => r.category).length,
        budgetCount: Object.values(result).filter(r => r.budget).length,
      },
      "Transaction processing complete"
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
      logger.debug(
        {
          categories,
          transactionCount: transactions.length,
          categoryCount: categories.length,
          batchCount: batches.length,
        },
        "Starting category processing with error handling"
      );

      const results = new Array(transactions.length).fill("");

      for (const batch of batches) {
        logger.debug(
          {
            batchSize: batch.transactions.length,
            batchIndices: batch.indices,
            batchTransactions: batch.transactions.map(t => ({
              id: t.transaction_journal_id,
              description: t.description,
              amount: t.amount,
              date: t.date
            }))
          },
          "Processing category batch"
        );

        // Pass all available categories to each batch
        const batchResults = await this.llmCategoryService.categorizeTransactions(
          batch.transactions,
          categories
        );

        logger.debug(
          {
            batchResults,
            batchIndices: batch.indices,
          },
          "Received batch results"
        );

        // Map batch results back to original indices
        batchResults.forEach((result, batchIndex) => {
          results[batch.indices[batchIndex]] = result;
        });
      }

      logger.debug(
        {
          totalProcessed: results.filter(r => r).length,
          totalTransactions: transactions.length,
          results,
        },
        "Category processing complete"
      );

      return results;
    } catch (error) {
      logger.error(
        { 
          error: error instanceof Error ? error.message : String(error),
          type: error instanceof Error ? error.constructor.name : typeof error,
          stack: error instanceof Error ? error.stack : undefined,
          categories,
          transactionCount: transactions.length,
          categoryCount: categories.length,
        }, 
        "Unable to assign categories"
      );
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
        logger.debug(
          {
            batchSize: batch.transactions.length,
            batchIndices: batch.indices,
          },
          "Processing budget batch"
        );

        const budgetResults = await this.llmBudgetService.assignBudgets(
          batch.transactions,
          budgets
        );

        // Map batch results back to original indices
        budgetResults.forEach((result, batchIndex) => {
          results[batch.indices[batchIndex]] = result;
        });
      }

      return results;
    } catch (error) {
      logger.error({
        error,
        transactionCount: transactions.length,
        message: "Error processing budgets",
      });
      return new Array(transactions.length).fill("");
    }
  }
}
