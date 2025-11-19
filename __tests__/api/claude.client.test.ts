import '../../__tests__/setup/mock-logger';
import { mockLogger } from '../setup/mock-logger';
import { ClaudeClient, ChatMessage } from '../../src/api/claude.client';
import Anthropic from '@anthropic-ai/sdk';

// Mock dependencies
jest.mock('@anthropic-ai/sdk');
jest.mock('../../src/utils/config-loader', () => ({
    loadYamlConfig: jest.fn(() => ({
        llm: {
            rateLimit: {
                maxTokensPerMinute: 50,
                refillInterval: 60000,
            },
            circuitBreaker: {
                failureThreshold: 5,
                resetTimeout: 60000,
                halfOpenTimeout: 30000,
            },
        },
    })),
}));

describe('ClaudeClient', () => {
    let client: ClaudeClient;
    let mockAnthropicClient: jest.Mocked<Anthropic>;
    let mockMessagesCreate: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        mockLogger.debug.mockClear();
        mockLogger.info.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.error.mockClear();

        // Create mock for Anthropic client
        mockMessagesCreate = jest.fn();
        mockAnthropicClient = {
            messages: {
                create: mockMessagesCreate,
            },
        } as unknown as jest.Mocked<Anthropic>;

        // Mock the Anthropic constructor
        (Anthropic as unknown as jest.Mock).mockImplementation(() => mockAnthropicClient);
    });

    describe('constructor', () => {
        it('should initialize with default configuration', () => {
            client = new ClaudeClient();

            expect(Anthropic).toHaveBeenCalledWith({
                apiKey: '',
                baseURL: 'https://api.anthropic.com',
                maxRetries: 3,
                timeout: 30000,
            });
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Initializing AI Client with model: claude-sonnet-4-5'
            );
        });

        it('should initialize with custom configuration', () => {
            client = new ClaudeClient({
                apiKey: 'test-api-key',
                model: 'claude-opus-4',
                maxTokens: 4000,
                temperature: 0.5,
            });

            expect(Anthropic).toHaveBeenCalledWith({
                apiKey: 'test-api-key',
                baseURL: 'https://api.anthropic.com',
                maxRetries: 3,
                timeout: 30000,
            });
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Initializing AI Client with model: claude-opus-4'
            );
        });

        it('should filter out undefined values from config', () => {
            client = new ClaudeClient({
                apiKey: 'test-key',
                topP: undefined,
                topK: undefined,
            });

            const config = client.getConfig();
            expect(config.topP).toBeUndefined();
            expect(config.topK).toBeUndefined();
        });
    });

    describe('chat', () => {
        beforeEach(() => {
            client = new ClaudeClient({ apiKey: 'test-key' });
        });

        it('should successfully make a chat request', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'Hello, Claude!' }];

            mockMessagesCreate.mockResolvedValue({
                content: [
                    {
                        type: 'text',
                        text: 'Hello! How can I help you?',
                    },
                ],
            });

            const response = await client.chat(messages);

            expect(response).toBe('Hello! How can I help you?');
            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'claude-sonnet-4-5',
                    messages,
                    max_tokens: 2000,
                    temperature: 0.2,
                })
            );
        });

        it('should handle multiple text blocks in response', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];

            mockMessagesCreate.mockResolvedValue({
                content: [
                    { type: 'text', text: 'First part' },
                    { type: 'text', text: 'Second part' },
                ],
            });

            const response = await client.chat(messages);

            expect(response).toBe('First part\nSecond part');
        });

        it('should handle tool_use response blocks', async () => {
            const messages: ChatMessage[] = [
                { role: 'user', content: 'Categorize these transactions' },
            ];

            mockMessagesCreate.mockResolvedValue({
                content: [
                    {
                        type: 'tool_use',
                        input: {
                            categories: ['Groceries', 'Healthcare'],
                        },
                    },
                ],
            });

            const response = await client.chat(messages);

            expect(response).toBe(
                JSON.stringify({
                    categories: ['Groceries', 'Healthcare'],
                })
            );
        });

        it('should throw error when response has no text content', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];

            mockMessagesCreate.mockResolvedValue({
                content: [],
            });

            await expect(client.chat(messages)).rejects.toThrow(
                'No text content found in response'
            );
        });

        it('should use override configuration', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];

            mockMessagesCreate.mockResolvedValue({
                content: [{ type: 'text', text: 'Response' }],
            });

            await client.chat(messages, {
                temperature: 0.8,
                maxTokens: 4000,
            });

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    temperature: 0.8,
                    max_tokens: 4000,
                })
            );
        });

        it('should include system prompt when provided', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];

            mockMessagesCreate.mockResolvedValue({
                content: [{ type: 'text', text: 'Response' }],
            });

            await client.chat(messages, {
                systemPrompt: 'You are a helpful assistant',
            });

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    system: 'You are a helpful assistant',
                })
            );
        });

        it('should include functions as tools when provided', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];

            mockMessagesCreate.mockResolvedValue({
                content: [{ type: 'tool_use', input: { result: 'success' } }],
            });

            await client.chat(messages, {
                functions: [
                    {
                        name: 'assign_categories',
                        description: 'Assign categories',
                        parameters: {
                            type: 'object',
                            properties: {
                                categories: {
                                    type: 'array',
                                    enum: ['Groceries', 'Healthcare'],
                                },
                            },
                            required: ['categories'],
                        },
                    },
                ],
            });

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    tools: [
                        {
                            name: 'assign_categories',
                            description: 'Assign categories',
                            input_schema: {
                                type: 'object',
                                properties: {
                                    categories: {
                                        type: 'array',
                                        enum: ['Groceries', 'Healthcare'],
                                    },
                                },
                                required: ['categories'],
                            },
                        },
                    ],
                })
            );
        });

        it('should include tool_choice when function_call is specified', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];

            mockMessagesCreate.mockResolvedValue({
                content: [{ type: 'tool_use', input: { result: 'success' } }],
            });

            await client.chat(messages, {
                functions: [
                    {
                        name: 'assign_categories',
                        description: 'Assign categories',
                        parameters: {
                            type: 'object',
                            properties: {},
                            required: [],
                        },
                    },
                ],
                function_call: { name: 'assign_categories' },
            });

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    tool_choice: {
                        type: 'tool',
                        name: 'assign_categories',
                    },
                })
            );
        });
    });

    describe('retry logic', () => {
        beforeEach(() => {
            client = new ClaudeClient({
                apiKey: 'test-key',
                maxRetries: 3,
                retryDelayMs: 10, // Use very short delay for tests
            });
        });

        it('should retry on failure and eventually succeed', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];

            mockMessagesCreate
                .mockRejectedValueOnce(new Error('API error'))
                .mockRejectedValueOnce(new Error('API error'))
                .mockResolvedValueOnce({
                    content: [{ type: 'text', text: 'Success' }],
                });

            const response = await client.chat(messages);

            expect(response).toBe('Success');
            expect(mockMessagesCreate).toHaveBeenCalledTimes(3);
            expect(mockLogger.warn).toHaveBeenCalled();
        }, 10000); // Increase timeout for retry delays

        it('should throw error after max retries exceeded', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];

            mockMessagesCreate.mockRejectedValue(new Error('Persistent API error'));

            await expect(client.chat(messages)).rejects.toThrow('Persistent API error');
            expect(mockMessagesCreate).toHaveBeenCalledTimes(3);
        }, 10000); // Increase timeout for retry delays
    });

    describe('circuit breaker', () => {
        beforeEach(() => {
            client = new ClaudeClient({
                apiKey: 'test-key',
                maxRetries: 1,
            });
        });

        it('should open circuit breaker after failure threshold', async () => {
            const messages: ChatMessage[] = [{ role: 'user', content: 'Test' }];

            mockMessagesCreate.mockRejectedValue(new Error('API error'));

            // Generate 5 failures to trigger circuit breaker
            for (let i = 0; i < 5; i++) {
                try {
                    await client.chat(messages);
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                } catch (_error) {
                    // Expected to fail
                }
            }

            // Next request should fail immediately due to circuit breaker
            await expect(client.chat(messages)).rejects.toThrow('Circuit breaker is OPEN');
        });
    });

    describe('chatBatch', () => {
        beforeEach(() => {
            client = new ClaudeClient({
                apiKey: 'test-key',
                batchSize: 2,
                maxConcurrent: 2,
            });
        });

        it('should process multiple message batches', async () => {
            const messageBatches: ChatMessage[][] = [
                [{ role: 'user', content: 'Request 1' }],
                [{ role: 'user', content: 'Request 2' }],
                [{ role: 'user', content: 'Request 3' }],
            ];

            mockMessagesCreate
                .mockResolvedValueOnce({
                    content: [{ type: 'text', text: 'Response 1' }],
                })
                .mockResolvedValueOnce({
                    content: [{ type: 'text', text: 'Response 2' }],
                })
                .mockResolvedValueOnce({
                    content: [{ type: 'text', text: 'Response 3' }],
                });

            const responses = await client.chatBatch(messageBatches);

            expect(responses).toEqual(['Response 1', 'Response 2', 'Response 3']);
            expect(mockMessagesCreate).toHaveBeenCalledTimes(3);
        });

        it('should respect batch size configuration', async () => {
            const messageBatches: ChatMessage[][] = Array.from({ length: 10 }, (_, i) => [
                { role: 'user', content: `Request ${i}` },
            ]);

            mockMessagesCreate.mockResolvedValue({
                content: [{ type: 'text', text: 'Response' }],
            });

            await client.chatBatch(messageBatches);

            // With batchSize 2 and maxConcurrent 2, should make 10 total calls
            expect(mockMessagesCreate).toHaveBeenCalledTimes(10);
        });
    });

    describe('updateConfig', () => {
        beforeEach(() => {
            client = new ClaudeClient({ apiKey: 'old-key' });
        });

        it('should update configuration', () => {
            client.updateConfig({
                temperature: 0.9,
                maxTokens: 4000,
            });

            const config = client.getConfig();
            expect(config.temperature).toBe(0.9);
            expect(config.maxTokens).toBe(4000);
        });

        it('should recreate client when API configuration changes', () => {
            const initialCallCount = (Anthropic as unknown as jest.Mock).mock.calls.length;

            client.updateConfig({
                apiKey: 'new-key',
                baseURL: 'https://custom-api.com',
            });

            expect(Anthropic).toHaveBeenCalledTimes(initialCallCount + 1);
            expect(Anthropic).toHaveBeenLastCalledWith({
                apiKey: 'new-key',
                baseURL: 'https://custom-api.com',
                maxRetries: 3,
                timeout: 30000,
            });
        });

        it('should not recreate client for non-API config changes', () => {
            const initialCallCount = (Anthropic as unknown as jest.Mock).mock.calls.length;

            client.updateConfig({
                temperature: 0.8,
                maxTokens: 3000,
            });

            expect(Anthropic).toHaveBeenCalledTimes(initialCallCount);
        });
    });

    describe('getConfig', () => {
        beforeEach(() => {
            client = new ClaudeClient({
                apiKey: 'secret-key',
                model: 'claude-opus-4',
                temperature: 0.7,
            });
        });

        it('should return configuration without API key', () => {
            const config = client.getConfig();

            expect(config).not.toHaveProperty('apiKey');
            expect(config.model).toBe('claude-opus-4');
            expect(config.temperature).toBe(0.7);
        });

        it('should include all non-sensitive configuration', () => {
            const config = client.getConfig();

            expect(config).toHaveProperty('model');
            expect(config).toHaveProperty('maxTokens');
            expect(config).toHaveProperty('temperature');
            expect(config).toHaveProperty('batchSize');
            expect(config).toHaveProperty('maxConcurrent');
        });
    });
});
