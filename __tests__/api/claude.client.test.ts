import {
    ClaudeClient,
    CircuitOpenError,
    ClaudeResponseError,
    ToolCall,
} from '../../src/api/claude.client.js';
import { ClaudeApiConfig, LLMConfig } from '../../src/config/config.types.js';
import Anthropic from '@anthropic-ai/sdk';
import { jest } from '@jest/globals';

const testLlmConfig: LLMConfig = {
    model: 'claude-sonnet-5',
    maxTokens: 2000,
    batchSize: 10,
    maxConcurrent: 3,
    rateLimit: {
        maxTokensPerMinute: 1000,
        refillInterval: 60000,
    },
    circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
    },
};

const testApiConfig: ClaudeApiConfig = {
    apiKey: 'test-api-key',
    baseURL: 'https://api.anthropic.com',
    timeout: 30000,
    maxRetries: 0,
};

const tool: Anthropic.Tool = {
    name: 'assign_categories',
    description: 'Assign categories',
    input_schema: { type: 'object', properties: {}, required: [] },
};

const call: ToolCall = { systemPrompt: 'You are helpful', userPrompt: 'Hello', tool };

const response = (content: unknown[], stopReason = 'tool_use'): Anthropic.Message =>
    ({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content,
        model: 'claude-sonnet-5',
        stop_reason: stopReason,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
    }) as unknown as Anthropic.Message;

const toolResponse = (input: unknown): Anthropic.Message =>
    response([{ type: 'tool_use', id: 'tu_1', name: tool.name, input }]);

describe('ClaudeClient', () => {
    let client: ClaudeClient;
    let mockAnthropicClient: jest.Mocked<Anthropic>;
    let mockMessagesCreate: jest.Mock<(params: unknown) => Promise<Anthropic.Message>>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockMessagesCreate = jest.fn<(params: unknown) => Promise<Anthropic.Message>>();
        mockAnthropicClient = {
            messages: {
                create: mockMessagesCreate,
            },
        } as unknown as jest.Mocked<Anthropic>;

        client = new ClaudeClient({ api: testApiConfig, llm: testLlmConfig }, mockAnthropicClient);
    });

    describe('callTool', () => {
        it('should return the forced tool call input as JSON', async () => {
            mockMessagesCreate.mockResolvedValue(toolResponse({ categories: ['Groceries'] }));

            const result = await client.callTool(call);

            expect(JSON.parse(result)).toEqual({ categories: ['Groceries'] });
            expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
        });

        it('should not send temperature, top_p, top_k, or stop_sequences', async () => {
            mockMessagesCreate.mockResolvedValue(toolResponse({}));

            await client.callTool(call);

            const params = mockMessagesCreate.mock.calls[0][0] as unknown as Record<
                string,
                unknown
            >;
            expect(params).not.toHaveProperty('temperature');
            expect(params).not.toHaveProperty('top_p');
            expect(params).not.toHaveProperty('top_k');
            expect(params).not.toHaveProperty('stop_sequences');
            expect(params).not.toHaveProperty('metadata');
        });

        it('should send the system prompt, user prompt and the forced tool', async () => {
            mockMessagesCreate.mockResolvedValue(toolResponse({ categories: [] }));

            await client.callTool(call);

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: testLlmConfig.model,
                    max_tokens: testLlmConfig.maxTokens,
                    system: 'You are helpful',
                    messages: [{ role: 'user', content: 'Hello' }],
                    tools: [tool],
                    tool_choice: { type: 'tool', name: 'assign_categories' },
                })
            );
        });
    });

    describe('forced tool extraction', () => {
        it('should return only the tool_use input, ignoring preamble text', async () => {
            // Regression: preamble text used to be joined with the JSON,
            // corrupting the payload and silently degrading the whole batch
            mockMessagesCreate.mockResolvedValue(
                response([
                    { type: 'text', text: 'Here are the assignments:' },
                    {
                        type: 'tool_use',
                        id: 'tu_1',
                        name: 'assign_categories',
                        input: { categories: ['Groceries'] },
                    },
                ])
            );

            const result = await client.callTool(call);

            expect(JSON.parse(result)).toEqual({ categories: ['Groceries'] });
        });

        it('should throw when the forced tool was not used', async () => {
            mockMessagesCreate.mockResolvedValue(
                response([{ type: 'text', text: 'I cannot do that' }], 'end_turn')
            );

            await expect(client.callTool(call)).rejects.toThrow(ClaudeResponseError);
            await expect(
                client.callTool(call).catch((e: ClaudeResponseError) => e.reason)
            ).resolves.toBe('missing_tool_use');
        });
    });

    describe('reasoning spend', () => {
        it('should cap effort so adaptive thinking cannot consume max_tokens', async () => {
            // Current models run adaptive thinking whenever `thinking` is
            // omitted, and those tokens come out of max_tokens. Left uncapped,
            // a forced-tool classification can spend its whole budget thinking
            // and come back truncated with no answer at all.
            mockMessagesCreate.mockResolvedValue(toolResponse({}));

            await client.callTool(call);

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({ output_config: { effort: 'low' } })
            );
        });
    });

    describe('stop_reason handling', () => {
        it('should throw a truncation error on max_tokens', async () => {
            mockMessagesCreate.mockResolvedValue(response([], 'max_tokens'));

            await expect(client.callTool(call)).rejects.toThrow(/truncated/i);
            expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
        });

        it('should throw on refusal', async () => {
            mockMessagesCreate.mockResolvedValue(response([], 'refusal'));

            await expect(client.callTool(call)).rejects.toThrow(/refused/i);
        });
    });

    describe('circuit breaker', () => {
        it('should count one failure per chat call and open at the threshold', async () => {
            mockMessagesCreate.mockRejectedValue(new Error('API Error'));

            // threshold is 5 — each callTool() is one HTTP-logical failure
            for (let i = 0; i < 5; i++) {
                await expect(client.callTool(call)).rejects.toThrow('API Error');
            }
            expect(mockMessagesCreate).toHaveBeenCalledTimes(5);

            // 6th call is rejected by the breaker without any HTTP call
            await expect(client.callTool(call)).rejects.toThrow(CircuitOpenError);
            expect(mockMessagesCreate).toHaveBeenCalledTimes(5);
        });

        it('should not count extraction failures as breaker failures', async () => {
            // 5 semantic failures (transport OK, no tool call) must not open it
            mockMessagesCreate.mockResolvedValue(response([], 'end_turn'));

            for (let i = 0; i < 5; i++) {
                await expect(client.callTool(call)).rejects.toThrow(ClaudeResponseError);
            }

            mockMessagesCreate.mockResolvedValue(toolResponse('recovered'));
            await expect(client.callTool(call)).resolves.toBe('"recovered"');
        });

        describe('HALF_OPEN probe', () => {
            beforeEach(async () => {
                jest.useFakeTimers();
                mockMessagesCreate.mockRejectedValue(new Error('API Error'));
                for (let i = 0; i < 5; i++) {
                    await expect(client.callTool(call)).rejects.toThrow('API Error');
                }
                mockMessagesCreate.mockClear();
            });

            afterEach(() => {
                jest.useRealTimers();
            });

            it('should close after a successful probe', async () => {
                jest.advanceTimersByTime(61000);
                mockMessagesCreate.mockResolvedValue(toolResponse('probe ok'));

                await expect(client.callTool(call)).resolves.toBe('"probe ok"');

                // Circuit is closed again — subsequent calls flow normally
                await expect(client.callTool(call)).resolves.toBe('"probe ok"');
                expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
            });

            it('should reopen when the probe fails', async () => {
                jest.advanceTimersByTime(61000);
                mockMessagesCreate.mockRejectedValue(new Error('still down'));

                await expect(client.callTool(call)).rejects.toThrow('still down');

                // Immediately OPEN again — no HTTP call
                await expect(client.callTool(call)).rejects.toThrow(CircuitOpenError);
                expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
            });

            it('should allow only one concurrent probe', async () => {
                jest.advanceTimersByTime(61000);
                let resolveProbe: (value: Anthropic.Message) => void;
                mockMessagesCreate.mockReturnValue(
                    new Promise<Anthropic.Message>(resolve => {
                        resolveProbe = resolve;
                    })
                );

                const probe = client.callTool(call);

                // Second call during the in-flight probe is rejected
                await expect(client.callTool(call)).rejects.toThrow(CircuitOpenError);

                resolveProbe!(toolResponse('probe ok'));
                await expect(probe).resolves.toBe('"probe ok"');
                expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('SDK error propagation', () => {
        it('should propagate SDK errors untouched', async () => {
            const apiError = Object.assign(new Error('rate limited'), { status: 429 });
            mockMessagesCreate.mockRejectedValue(apiError);

            await expect(client.callTool(call)).rejects.toBe(apiError);
        });
    });
});
