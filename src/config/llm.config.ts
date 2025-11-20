import { ClaudeClient } from '../api/claude.client.js';
import { claudeAPIKey as defaultClaudeAPIKey } from '../config.js';
import { loadYamlConfig as defaultLoadYamlConfig } from '../utils/config-loader.js';
import chalk from 'chalk';

export class LLMConfig {
    static createClient(
        claudeAPIKey?: string,
        loadYamlConfig: typeof defaultLoadYamlConfig = defaultLoadYamlConfig
    ): ClaudeClient {
        // Use provided key or fall back to default from environment
        const apiKey = claudeAPIKey ?? defaultClaudeAPIKey;

        if (!apiKey) {
            throw new Error(
                `${chalk.redBright(
                    '!!!'
                )} Claude API Key is required to update transactions. Please check your .env file. ${chalk.redBright(
                    '!!!'
                )}`
            );
        }

        // Load all LLM configuration from YAML (user-configurable business logic)
        const yamlConfig = loadYamlConfig();
        const llmConfig = yamlConfig.llm;

        // Validate that LLM config exists
        if (!llmConfig) {
            throw new Error(
                `${chalk.redBright(
                    '!!!'
                )} LLM configuration missing from budgeting-toolkit.config.yaml. Please add llm section with model and other settings. ${chalk.redBright(
                    '!!!'
                )}`
            );
        }

        return new ClaudeClient({
            // Authentication from environment (secure)
            apiKey: apiKey,

            // All other settings from YAML (user-configurable)
            model: llmConfig.model,
            maxTokens: llmConfig.maxTokens,
            batchSize: llmConfig.batchSize,
            maxConcurrent: llmConfig.maxConcurrent,
            temperature: llmConfig.temperature,
            retryDelayMs: llmConfig.retryDelayMs,
            maxRetryDelayMs: llmConfig.maxRetryDelayMs,
        });
    }
}
