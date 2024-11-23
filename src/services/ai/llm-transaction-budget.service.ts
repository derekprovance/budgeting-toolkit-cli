import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { ChatMessage, ClaudeClient } from "../../api/claude.client";
import { logger } from "../../logger";

export class LLMTransactionBudgetService {
  constructor(private claudeClient: ClaudeClient) {}

  async assignBudgets(
    budgets: string[],
    transactions: TransactionSplit[],
    categories: string[]
  ): Promise<string[]> {
    const systemPrompt = this.buildBudgetPrompt(budgets);
    const messageBatches = this.prepareTransactionBatches(
      transactions,
      categories
    );

    try {
      return await this.claudeClient.chatBatch(messageBatches, {
        systemPrompt,
      });
    } catch (error) {
      logger.error("Error assigning budgets:", error);
      throw error;
    }
  }

  private buildBudgetPrompt(budgets: string[]): string {
    return `You are a budget assignment assistant. Your task is to analyze transactions and assign each to exactly ONE budget category from this list:
      ${budgets.map((budget) => `- ${budget}`).join("\n")}
      
      CRITICAL: You must ALWAYS respond with ONLY the exact budget name from the list above OR an empty string.
      
      Rules:
      1. Choose ONE budget from the provided list that best matches the transaction
      2. Copy-paste the exact budget name - do not modify or abbreviate it
      3. Never include explanations, punctuation, or additional text
      4. DO NOT explain your choice or add any other text

      Examples:
      Input: "Walmart groceries $50"
      Output: Groceries
      
      Input: "ATM withdrawal"
      Output: 
      
      Input: "Netflix subscription"
      Output: Entertainment`;
  }

  private prepareTransactionBatches(
    transactions: TransactionSplit[],
    categories: string[]
  ): ChatMessage[][] {
    return transactions.map((tx, index) => [
      {
        role: "user" as const,
        content: `Transaction: ${tx.description}
          Amount: $${tx.amount}
          Date: ${tx.date}
          Assigned Category: ${categories[index]}`,
      },
    ]);
  }
}
