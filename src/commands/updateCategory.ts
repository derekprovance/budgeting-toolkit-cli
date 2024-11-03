import { ClaudeClient } from "../api/ClaudeClient";
import { claudeAPIKey } from "../config";
import { AIService } from "../services/ai.service";
import { TransactionService } from "../services/transaction.service";
import { UpdateCategoryService } from "../services/update-category.service";

export const updateDescriptions = async (
  transactionService: TransactionService,
  tag: string
) => {
  if (!claudeAPIKey) {
    console.log(
      "!!! Claude API Key is required to update categories. Please check your .env file. !!!"
    );
    return;
  }

  const claudeClient = new ClaudeClient({ apiKey: claudeAPIKey });
  const aiService = new AIService(claudeClient);
  const updateCategoryService = new UpdateCategoryService(
    transactionService,
    aiService
  );

  await updateCategoryService.updateCategoriesByTag(tag);
};
