import { ClaudeClient } from "../api/claude.client";
import { claudeAPIKey } from "../config";
import { AIService } from "../services/ai.service";
import { CategoryService } from "../services/category.service";
import { TransactionService } from "../services/transaction.service";
import { UpdateCategoryService } from "../services/update-category.service";

export const updateDescriptions = async (
  transactionService: TransactionService,
  categoryService: CategoryService,
  tag: string
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
  const updateCategoryService = new UpdateCategoryService(
    transactionService,
    categoryService,
    aiService
  );

  console.log(await updateCategoryService.updateCategoriesByTag(tag));
};
