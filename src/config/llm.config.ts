import { ClaudeClient } from '../api/claude.client.js';
import { config, claudeAPIKey as defaultClaudeAPIKey } from '../config.js';
import chalk from 'chalk';

export class LLMConfig {
    static createClient(claudeAPIKey?: string): ClaudeClient {
        // Use provided key or fall back to default from environment
        const apiKey = claudeAPIKey ?? defaultClaudeAPIKey;

        if (!apiKey) {
            throw new Error(
                `${chalk.redBright(
                    '!!!'
                )} Claude API Key is required for commands with an LLM dependency. Please check your .env file. ${chalk.redBright(
                    '!!!'
                )}`
            );
        }

        // Get LLM configuration from ConfigManager
        const llmConfig = config.llm;

        return new ClaudeClient(
            {
                // Authentication from environment (secure)
                apiKey: apiKey,

                // All other settings from configuration (user-configurable)
                model: llmConfig.model,
                maxTokens: llmConfig.maxTokens,
                batchSize: llmConfig.batchSize,
                maxConcurrent: llmConfig.maxConcurrent,
                temperature: llmConfig.temperature,
                retryDelayMs: llmConfig.retryDelayMs,
                maxRetryDelayMs: llmConfig.maxRetryDelayMs,
            },
            undefined, // client
            llmConfig // Pass full LLM config for rate limiting and circuit breaker
        );
    }
}
