import { TransactionSplit } from "firefly-iii-sdk";
import { ClaudeClient } from "../api/claude.client";
import { logger } from "../logger";

export interface AIResponse {
  category: string;
  budget?: string;
}

export class AIService {
  constructor(private claudeClient: ClaudeClient) {}

  async categorizeTransactions(
    categories: string[],
    transactions: TransactionSplit[]
  ): Promise<string[]> {
    logger.debug(`Categorizing ${transactions.length} transactions using LLM`);

    const systemPrompt = `You are a transaction categorizer. Analyze each transaction and assign it to ONE of these categories:
      ${categories.map((cat) => `- ${cat}`).join("\n")}

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

  async assignBudgets(
    budgets: string[],
    transactions: TransactionSplit[],
    categories: string[]
  ): Promise<string[]> {
    logger.debug(`Assigning ${transactions.length} budget(s) using LLM`);

    const systemPrompt = `You are a budget assignment assistant. Analyze each transaction and assign it to ONE of these budgets (if applicable):
      ${budgets.map((budget) => `- ${budget}`).join("\n")}

      Rules:
      1. Respond ONLY with the exact budget name OR leave empty if no budget applies
      2. Choose the most appropriate budget based on the transaction details and assigned category
      3. If no budget is appropriate, respond with an empty string
      4. DO NOT explain your choice or add any other text`;

    const messageBatches = transactions.map((tx, index) => [
      {
        role: "user" as const,
        content: `Transaction: ${tx.description}
          Amount: $${tx.amount}
          Date: ${tx.date}
          Assigned Category: ${categories[index]}`,
      },
    ]);

    try {
      return await this.claudeClient.chatBatch(messageBatches, {
        systemPrompt,
      });
    } catch (error) {
      console.error("Error assigning budgets:", error);
      throw error;
    }
  }

  async processTransactions(
    transactions: TransactionSplit[],
    categories: string[],
    budgets?: string[]
  ): Promise<AIResponse[]> {
    const assignedCategories = await this.categorizeTransactions(
      categories,
      transactions
    );

    if (!budgets?.length) {
      return assignedCategories.map((category) => ({ category }));
    }

    const assignedBudgets = await this.assignBudgets(
      budgets,
      transactions,
      assignedCategories
    );

    return assignedCategories.map((category, index) => ({
      category,
      ...(assignedBudgets[index] ? { budget: assignedBudgets[index] } : {}),
    }));
  }
}
