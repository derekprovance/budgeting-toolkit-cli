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

                // SDK transport settings (retries/timeouts owned by the SDK)
                baseURL: config.api.claude.baseURL,
                timeout: config.api.claude.timeout,
                maxRetries: config.api.claude.maxRetries,

                // Model settings from configuration (user-configurable)
                model: llmConfig.model,
                maxTokens: llmConfig.maxTokens,
            },
            undefined, // client
            llmConfig // Pass full LLM config for rate limiting and circuit breaker
        );
    }
}
