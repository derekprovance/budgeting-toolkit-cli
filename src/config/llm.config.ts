import { ClaudeClient } from "../api/claude.client";
import { claudeAPIKey, llmModel } from "../config";
import chalk from "chalk";

export class LLMConfig {
  static createClient(): ClaudeClient {
    if (!claudeAPIKey) {
      throw new Error(
        `${chalk.redBright(
          "!!!"
        )} Claude API Key is required to update transactions. Please check your .env file. ${chalk.redBright(
          "!!!"
        )}`
      );
    }

    return new ClaudeClient({
      apiKey: claudeAPIKey,
      model: llmModel,
      maxTokens: 20,
      maxRetries: 3,
      batchSize: 10,
      maxConcurrent: 5,
    });
  }
}
