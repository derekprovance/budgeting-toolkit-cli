import { ClaudeClient } from "../api/claude.client";
import { claudeAPIKey } from "../config";
import { AIService } from "../services/ai.service";
import { BudgetService } from "../services/budget.service";
import { CategoryService } from "../services/category.service";
import { TransactionService } from "../services/transaction.service";
import { UpdateTransactionService } from "../services/update-transaction.service";

export const updateDescriptions = async (
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

  const claudeClient = new ClaudeClient({
    apiKey: claudeAPIKey,
    model: "claude-3-haiku-20240307",
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
  console.log(
    await updateCategoryService.updateTransactionsByTag(tag, updateBudget)
  );
};
