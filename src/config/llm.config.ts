import { ClaudeClient } from '../api/claude.client';
import { claudeAPIKey } from '../config';
import { loadYamlConfig } from '../utils/config-loader';
import chalk from 'chalk';

export class LLMConfig {
    static createClient(): ClaudeClient {
        if (!claudeAPIKey) {
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
            apiKey: claudeAPIKey,

            // All other settings from YAML (user-configurable)
            model: llmConfig.model || 'claude-3-5-haiku-latest',
            maxTokens: llmConfig.maxTokens || 2000,
            maxRetries: 3,
            batchSize: llmConfig.batchSize || 5,
            maxConcurrent: llmConfig.maxConcurrent || 2,
            temperature: llmConfig.temperature || 0.1,
            retryDelayMs: llmConfig.retryDelayMs || 1500,
            maxRetryDelayMs: llmConfig.maxRetryDelayMs || 30000,
        });
    }
}
