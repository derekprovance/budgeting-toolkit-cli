import { ClaudeClient } from "../api/claude.client";
import { claudeAPIKey, llmModel } from "../config";
import { AIService } from "../services/ai/ai.service";
import { BudgetService } from "../services/core/budget.service";
import { CategoryService } from "../services/core/category.service";
import { TransactionService } from "../services/core/transaction.service";
import { UpdateTransactionService } from "../services/update-transaction.service";

export const updateTransactions = async (
  transactionService: TransactionService,
  categoryService: CategoryService,
  budgetService: BudgetService,
  tag: string,
  updateBudget: boolean
) => {
  if (!claudeAPIKey) {
    console.log(
      "!!! Claude API Key is required to update categories. Please check your .env file. !!!"
    );
    return;
  }

  console.log("Categorizing transactions using an LLM...")

  const claudeClient = new ClaudeClient({
    apiKey: claudeAPIKey,
    model: llmModel,
    maxTokens: 20,
    maxRetries: 3,
    batchSize: 10,
    maxConcurrent: 5,
  });
  const aiService = new AIService(claudeClient);
  const updateCategoryService = new UpdateTransactionService(
    transactionService,
    categoryService,
    budgetService,
    aiService
  );

  const results = await updateCategoryService.updateTransactionsByTag(
    tag,
    updateBudget
  );
  console.log(results);
};
