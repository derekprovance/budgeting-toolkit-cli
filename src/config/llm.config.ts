import { ClaudeClient } from "../api/claude.client";
import { claudeAPIKey, llmModel } from "../config";
import { getConfigValue, loadYamlConfig } from "../utils/config-loader";
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

    // Load configuration from YAML with fallbacks
    const yamlConfig = loadYamlConfig();
    const llmConfig = yamlConfig.llm;
    
    return new ClaudeClient({
      apiKey: claudeAPIKey,
      model: llmConfig?.model || llmModel,
      maxTokens: llmConfig?.maxTokens || 1000,
      maxRetries: 3,
      batchSize: llmConfig?.batchSize || 10,
      maxConcurrent: llmConfig?.maxConcurrent || 3,
      temperature: llmConfig?.temperature || 0.2,
      retryDelayMs: llmConfig?.retryDelayMs || 1000,
      maxRetryDelayMs: llmConfig?.maxRetryDelayMs || 32000,
    });
  }
}
