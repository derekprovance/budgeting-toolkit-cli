import { describe, expect, it } from '@jest/globals';
import { createClaudeClient } from '../../src/config/llm.config.js';
import { DEFAULT_CONFIG } from '../../src/config/config.defaults.js';
import { AppConfig } from '../../src/config/config.types.js';
import { ClaudeClient } from '../../src/api/claude.client.js';

const configWithApiKey = (apiKey: string): AppConfig => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.api.claude.apiKey = apiKey;
    return config;
};

describe('createClaudeClient', () => {
    it('creates a ClaudeClient from the injected config', () => {
        expect(createClaudeClient(configWithApiKey('test-api-key'))).toBeInstanceOf(ClaudeClient);
    });

    it('throws when the Claude API key is missing', () => {
        expect(() => createClaudeClient(configWithApiKey(''))).toThrow(
            /ANTHROPIC_API_KEY is required but not set/
        );
    });
});
