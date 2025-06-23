import { LLMConfig } from '../../src/config/llm.config';
import { ClaudeClient } from '../../src/api/claude.client';
import { loadYamlConfig } from '../../src/utils/config-loader';

// Mock dependencies
jest.mock('../../src/api/claude.client');
jest.mock('../../src/utils/config-loader');
jest.mock('../../src/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const mockLoadYamlConfig = loadYamlConfig as jest.MockedFunction<typeof loadYamlConfig>;

// Mock the config module inline
const mockClaudeAPIKey = jest.fn();
jest.mock('../../src/config', () => ({
  get claudeAPIKey() {
    return mockClaudeAPIKey();
  }
}));

describe('LLMConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createClient', () => {
    it('should create ClaudeClient with API key and default LLM config', () => {
      mockClaudeAPIKey.mockReturnValue('test-api-key');
      mockLoadYamlConfig.mockReturnValue({
        llm: {
          model: 'claude-3-5-sonnet-latest',
          maxTokens: 4000,
          batchSize: 10,
          maxConcurrent: 3,
          temperature: 0.2,
          retryDelayMs: 2000,
          maxRetryDelayMs: 60000
        }
      });

      LLMConfig.createClient();

      expect(ClaudeClient).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        model: 'claude-3-5-sonnet-latest',
        maxTokens: 4000,
        maxRetries: 3,
        batchSize: 10,
        maxConcurrent: 3,
        temperature: 0.2,
        retryDelayMs: 2000,
        maxRetryDelayMs: 60000
      });
    });

    it('should use default values when LLM config values are not provided', () => {
      mockClaudeAPIKey.mockReturnValue('test-api-key');
      mockLoadYamlConfig.mockReturnValue({
        llm: {} // Empty LLM config
      });

      LLMConfig.createClient();

      expect(ClaudeClient).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        model: 'claude-3-5-haiku-latest',
        maxTokens: 2000,
        maxRetries: 3,
        batchSize: 5,
        maxConcurrent: 2,
        temperature: 0.1,
        retryDelayMs: 1500,
        maxRetryDelayMs: 30000
      });
    });

    it('should throw error when Claude API key is missing', () => {
      mockClaudeAPIKey.mockReturnValue('');
      mockLoadYamlConfig.mockReturnValue({
        llm: {
          model: 'claude-3-5-sonnet-latest'
        }
      });

      expect(() => LLMConfig.createClient()).toThrow(/Claude API Key is required/);
    });

    it('should throw error when Claude API key is undefined', () => {
      mockClaudeAPIKey.mockReturnValue(undefined);
      mockLoadYamlConfig.mockReturnValue({
        llm: {
          model: 'claude-3-5-sonnet-latest'
        }
      });

      expect(() => LLMConfig.createClient()).toThrow(/Claude API Key is required/);
    });

    it('should throw error when LLM config is missing from YAML', () => {
      mockClaudeAPIKey.mockReturnValue('test-api-key');
      mockLoadYamlConfig.mockReturnValue({}); // No LLM config

      expect(() => LLMConfig.createClient()).toThrow(/LLM configuration missing/);
    });

    it('should throw error when LLM config is undefined', () => {
      mockClaudeAPIKey.mockReturnValue('test-api-key');
      mockLoadYamlConfig.mockReturnValue({
        llm: undefined
      });

      expect(() => LLMConfig.createClient()).toThrow(/LLM configuration missing/);
    });

    it('should handle partial LLM config with some values missing', () => {
      mockClaudeAPIKey.mockReturnValue('test-api-key');
      mockLoadYamlConfig.mockReturnValue({
        llm: {
          model: 'custom-model',
          maxTokens: 3000,
          // Missing other values - should use defaults
        }
      });

      LLMConfig.createClient();

      expect(ClaudeClient).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        model: 'custom-model',
        maxTokens: 3000,
        maxRetries: 3,
        batchSize: 5, // default
        maxConcurrent: 2, // default
        temperature: 0.1, // default
        retryDelayMs: 1500, // default
        maxRetryDelayMs: 30000 // default
      });
    });

    it('should return ClaudeClient instance when called successfully', () => {
      const mockClaudeClient = {} as ClaudeClient;
      (ClaudeClient as jest.MockedClass<typeof ClaudeClient>).mockImplementation(() => mockClaudeClient);
      
      mockClaudeAPIKey.mockReturnValue('test-api-key');
      mockLoadYamlConfig.mockReturnValue({
        llm: {
          model: 'claude-3-5-sonnet-latest'
        }
      });

      const result = LLMConfig.createClient();

      expect(result).toBe(mockClaudeClient);
    });
  });
});