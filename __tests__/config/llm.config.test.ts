import { jest } from '@jest/globals';
import { LLMConfig } from '../../src/config/llm.config.js';
import { ClaudeClient } from '../../src/api/claude.client.js';

describe('LLMConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createClient', () => {
        it('should create ClaudeClient with API key and LLM config from ConfigManager', () => {
            const client = LLMConfig.createClient('test-api-key');

            expect(client).toBeInstanceOf(ClaudeClient);
        });

        it('should throw error when Claude API key is missing', () => {
            expect(() => LLMConfig.createClient('')).toThrow(/Claude API Key is required/);
        });

        it('should return ClaudeClient instance when called successfully', () => {
            const client = LLMConfig.createClient('valid-api-key');

            expect(client).toBeDefined();
            expect(client).toBeInstanceOf(ClaudeClient);
        });
    });
});
