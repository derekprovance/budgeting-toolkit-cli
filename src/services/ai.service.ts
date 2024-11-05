import { TransactionSplit } from "firefly-iii-sdk";
import { ClaudeClient } from "../api/claude.client";

export class AIService {
  constructor(private claudeClient: ClaudeClient) {}

  async categorizeTransactions(
    categories: string[],
    transactions: TransactionSplit[]
  ): Promise<string[]> {
    // Initialize client with optimal settings for categorization
    // Build system prompt from categories
    const systemPrompt = `You are a transaction categorizer. Analyze each transaction and assign it to ONE of these categories:
      ${categories.join("\n")}
      
      Rules:
      1. Respond ONLY with the exact category name
      2. Choose the best matching category based on the merchant and transaction details
      3. If uncertain, choose the most likely category
      4. DO NOT explain your choice or add any other text`;

    const messageBatches = transactions.map((tx) => [
      {
        role: "user" as const,
        content: `Transaction: ${tx.description}
          Amount: $${tx.amount}
          Date: ${tx.date}`,
      },
    ]);

    try {
      return await this.claudeClient.chatBatch(messageBatches, {
        systemPrompt,
      });
    } catch (error) {
      console.error("Error categorizing transactions:", error);
      throw error;
    }
  }
}
