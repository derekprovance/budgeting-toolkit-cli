import { jest } from '@jest/globals';
import { LLMConfig } from '../../src/config/llm.config.js';
import { ClaudeClient } from '../../src/api/claude.client.js';

describe('LLMConfig', () => {
    let mockLoadYamlConfig: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLoadYamlConfig = jest.fn();
    });

    describe('createClient', () => {
        it('should create ClaudeClient with API key and default LLM config', () => {
            mockLoadYamlConfig.mockReturnValue({
                llm: {
                    model: 'claude-sonnet-4-5',
                    maxTokens: 4000,
                    batchSize: 10,
                    maxConcurrent: 3,
                    temperature: 0.2,
                    retryDelayMs: 2000,
                    maxRetryDelayMs: 60000,
                },
            });

            const client = LLMConfig.createClient('test-api-key', mockLoadYamlConfig);

            expect(client).toBeInstanceOf(ClaudeClient);
            expect(mockLoadYamlConfig).toHaveBeenCalled();
        });

        it('should throw error when Claude API key is missing', () => {
            mockLoadYamlConfig.mockReturnValue({
                llm: {
                    model: 'claude-sonnet-4-5',
                },
            });

            expect(() => LLMConfig.createClient('', mockLoadYamlConfig)).toThrow(
                /Claude API Key is required/
            );
        });

        it('should throw error when LLM config is missing from YAML', () => {
            mockLoadYamlConfig.mockReturnValue({}); // No LLM config

            expect(() => LLMConfig.createClient('test-api-key', mockLoadYamlConfig)).toThrow(
                /LLM configuration missing/
            );
        });

        it('should throw error when LLM config is undefined', () => {
            mockLoadYamlConfig.mockReturnValue({
                llm: undefined,
            });

            expect(() => LLMConfig.createClient('test-api-key', mockLoadYamlConfig)).toThrow(
                /LLM configuration missing/
            );
        });

        it('should handle partial LLM config with some values missing', () => {
            mockLoadYamlConfig.mockReturnValue({
                llm: {
                    model: 'claude-opus-4',
                    // Some fields missing - ClaudeClient will use defaults
                },
            });

            const client = LLMConfig.createClient('test-api-key', mockLoadYamlConfig);

            expect(client).toBeInstanceOf(ClaudeClient);
        });

        it('should return ClaudeClient instance when called successfully', () => {
            mockLoadYamlConfig.mockReturnValue({
                llm: {
                    model: 'claude-sonnet-4-5',
                    maxTokens: 2000,
                },
            });

            const client = LLMConfig.createClient('valid-api-key', mockLoadYamlConfig);

            expect(client).toBeDefined();
            expect(client).toBeInstanceOf(ClaudeClient);
        });
    });
});
