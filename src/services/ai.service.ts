import { TransactionSplit } from "firefly-iii-sdk";
import { ClaudeClient } from "../api/ClaudeClient";

interface TransactionCategoryResponse {
  category: string;
}

export class AIService {
  constructor(private claudeClient: ClaudeClient) {}

  async getCategoryForTransaction(
    transaction: TransactionSplit
  ): Promise<string> {
    return "null";
  }
}
