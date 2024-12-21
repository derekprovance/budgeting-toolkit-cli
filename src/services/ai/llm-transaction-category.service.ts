import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { ChatMessage, ClaudeClient } from "../../api/claude.client";
import { logger } from "../../logger";
import { LLMResponseValidator } from "../ai/llm-response-validator.service";

export class LLMTransactionCategoryService {
  constructor(private claudeClient: ClaudeClient) {}

  async categorizeTransactions(
    categories: string[],
    transactions: TransactionSplit[]
  ): Promise<string[]> {
    const systemPrompt = this.buildCategoryPrompt(categories);
    const messageBatches = this.prepareTransactionBatches(transactions);

    try {
      const responses = await this.claudeClient.chatBatch(messageBatches, {
        systemPrompt,
      });

      return LLMResponseValidator.validateBatchResponses(responses, 
        (response) => LLMResponseValidator.validateCategoryResponse(response, categories)
      );
    } catch (error) {
      logger.error("Error categorizing transactions:", error);
      throw error;
    }
  }

  private buildCategoryPrompt(categories: string[]): string {
    return `You are a transaction categorizer. Analyze each transaction and assign it to ONE of these categories:
        ${categories.map((cat) => `- ${cat}`).join("\n")}
        
        Rules:
        1. Respond ONLY with the exact category name
        2. Choose the best matching category based on the merchant and transaction details
        3. If uncertain, choose the most likely category
        4. DO NOT explain your choice or add any other text`;
  }

  private prepareTransactionBatches(
    transactions: TransactionSplit[]
  ): ChatMessage[][] {
    return transactions.map((tx) => [
      {
        role: "user" as const,
        content: `Transaction: ${tx.description}
          Amount: $${tx.amount}
          Date: ${tx.date}`,
      },
    ]);
  }
}
