import { ClaudeClient } from '../api/claude.client.js';
import { ConfigManager } from './config-manager.js';

export class LLMConfig {
    static createClient(claudeAPIKey?: string): ClaudeClient {
        const config = ConfigManager.getInstance().getConfig();
        // Use provided key or fall back to default from environment
        const apiKey = claudeAPIKey ?? config.api.claude.apiKey;

        // API key validation now handled by CommandConfigValidator.validateCategorizeCommand()
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is required but not set');
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
