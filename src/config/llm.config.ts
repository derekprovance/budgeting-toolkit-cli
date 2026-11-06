import { ClaudeClient } from '../api/claude.client.js';
import { AppConfig } from './config.types.js';

/**
 * Builds the Claude client from the application config.
 *
 * @throws Error when `api.claude.apiKey` is empty (`ANTHROPIC_API_KEY` unset)
 */
export function createClaudeClient(config: AppConfig): ClaudeClient {
    if (!config.api.claude.apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required but not set');
    }
    return new ClaudeClient({ api: config.api.claude, llm: config.llm });
}
