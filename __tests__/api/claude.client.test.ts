import '../../__tests__/setup/mock-logger';
import {
    ClaudeClient,
    ChatMessage,
    CircuitOpenError,
    ClaudeResponseError,
} from '../../src/api/claude.client.js';
import { LLMConfig } from '../../src/config/config.types.js';
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

const textResponse = (text: string): Anthropic.Message =>
    ({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text }],
        model: 'claude-sonnet-5',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
    }) as unknown as Anthropic.Message;

describe('ClaudeClient', () => {
    let client: ClaudeClient;
    let mockAnthropicClient: jest.Mocked<Anthropic>;
    let mockMessagesCreate: jest.Mock<() => Promise<Anthropic.Message>>;

    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

    beforeEach(() => {
        jest.clearAllMocks();

        mockMessagesCreate = jest.fn<() => Promise<Anthropic.Message>>();
        mockAnthropicClient = {
            messages: {
                create: mockMessagesCreate,
            },
        } as unknown as jest.Mocked<Anthropic>;

        client = new ClaudeClient({}, mockAnthropicClient, testLlmConfig);
    });

    describe('chat', () => {
        it('should successfully make a chat request and return text', async () => {
            mockMessagesCreate.mockResolvedValue(textResponse('Hello there'));

            const result = await client.chat(messages);

            expect(result).toBe('Hello there');
            expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
        });

        it('should join multiple text blocks', async () => {
            mockMessagesCreate.mockResolvedValue({
                ...textResponse(''),
                content: [
                    { type: 'text', text: 'First' },
                    { type: 'text', text: 'Second' },
                ],
            } as unknown as Anthropic.Message);

            const result = await client.chat(messages);

            expect(result).toBe('First\nSecond');
        });

        it('should not send temperature, top_p, top_k, or stop_sequences', async () => {
            mockMessagesCreate.mockResolvedValue(textResponse('ok'));

            await client.chat(messages);

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

        it('should include system prompt, tools, and tool_choice when provided', async () => {
            mockMessagesCreate.mockResolvedValue({
                ...textResponse(''),
                content: [
                    {
                        type: 'tool_use',
                        id: 'tu_1',
                        name: 'assign_categories',
                        input: { categories: [] },
                    },
                ],
                stop_reason: 'tool_use',
            } as unknown as Anthropic.Message);

            const tool: Anthropic.Tool = {
                name: 'assign_categories',
                description: 'Assign categories',
                input_schema: { type: 'object', properties: {}, required: [] },
            };

            await client.chat(messages, {
                systemPrompt: 'You are helpful',
                tools: [tool],
                toolChoice: { type: 'tool', name: 'assign_categories' },
            });

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    system: 'You are helpful',
                    tools: [tool],
                    tool_choice: { type: 'tool', name: 'assign_categories' },
                })
            );
        });

        it('should throw when the response has no text content', async () => {
            mockMessagesCreate.mockResolvedValue({
                ...textResponse(''),
                content: [],
            } as unknown as Anthropic.Message);

            await expect(client.chat(messages)).rejects.toThrow(
                'No text content found in response'
            );
        });
    });

    describe('forced tool extraction', () => {
        const toolChoice = { type: 'tool', name: 'assign_categories' } as const;

        it('should return only the tool_use input, ignoring preamble text', async () => {
            // Regression: preamble text used to be joined with the JSON,
            // corrupting the payload and silently degrading the whole batch
            mockMessagesCreate.mockResolvedValue({
                ...textResponse(''),
                content: [
                    { type: 'text', text: 'Here are the assignments:' },
                    {
                        type: 'tool_use',
                        id: 'tu_1',
                        name: 'assign_categories',
                        input: { categories: ['Groceries'] },
                    },
                ],
                stop_reason: 'tool_use',
            } as unknown as Anthropic.Message);

            const result = await client.chat(messages, { toolChoice });

            expect(JSON.parse(result)).toEqual({ categories: ['Groceries'] });
        });

        it('should throw when the forced tool was not used', async () => {
            mockMessagesCreate.mockResolvedValue(textResponse('I cannot do that'));

            await expect(client.chat(messages, { toolChoice })).rejects.toThrow(
                ClaudeResponseError
            );
            await expect(
                client.chat(messages, { toolChoice }).catch((e: ClaudeResponseError) => e.reason)
            ).resolves.toBe('missing_tool_use');
        });
    });

    describe('reasoning spend', () => {
        it('should cap effort so adaptive thinking cannot consume max_tokens', async () => {
            // Current models run adaptive thinking whenever `thinking` is
            // omitted, and those tokens come out of max_tokens. Left uncapped,
            // a forced-tool classification can spend its whole budget thinking
            // and come back truncated with no answer at all.
            mockMessagesCreate.mockResolvedValue(
                textResponse('ok') as unknown as Anthropic.Message
            );

            await client.chat(messages);

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({ output_config: { effort: 'low' } })
            );
        });

        it('should let a caller override the effort level', async () => {
            mockMessagesCreate.mockResolvedValue(
                textResponse('ok') as unknown as Anthropic.Message
            );

            await client.chat(messages, { effort: 'high' });

            expect(mockMessagesCreate).toHaveBeenCalledWith(
                expect.objectContaining({ output_config: { effort: 'high' } })
            );
        });
    });

    describe('stop_reason handling', () => {
        it('should throw a truncation error on max_tokens', async () => {
            mockMessagesCreate.mockResolvedValue({
                ...textResponse('partial'),
                stop_reason: 'max_tokens',
            } as unknown as Anthropic.Message);

            await expect(client.chat(messages)).rejects.toThrow(/truncated/i);
            expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
        });

        it('should throw on refusal', async () => {
            mockMessagesCreate.mockResolvedValue({
                ...textResponse(''),
                stop_reason: 'refusal',
            } as unknown as Anthropic.Message);

            await expect(client.chat(messages)).rejects.toThrow(/refused/i);
        });
    });

    describe('circuit breaker', () => {
        it('should count one failure per chat call and open at the threshold', async () => {
            mockMessagesCreate.mockRejectedValue(new Error('API Error'));

            // threshold is 5 — each chat() is one HTTP-logical failure
            for (let i = 0; i < 5; i++) {
                await expect(client.chat(messages)).rejects.toThrow('API Error');
            }
            expect(mockMessagesCreate).toHaveBeenCalledTimes(5);

            // 6th call is rejected by the breaker without any HTTP call
            await expect(client.chat(messages)).rejects.toThrow(CircuitOpenError);
            expect(mockMessagesCreate).toHaveBeenCalledTimes(5);
        });

        it('should not count extraction failures as breaker failures', async () => {
            // 5 semantic failures (transport OK, empty content) must not open it
            mockMessagesCreate.mockResolvedValue({
                ...textResponse(''),
                content: [],
            } as unknown as Anthropic.Message);

            for (let i = 0; i < 5; i++) {
                await expect(client.chat(messages)).rejects.toThrow(ClaudeResponseError);
            }

            mockMessagesCreate.mockResolvedValue(textResponse('recovered'));
            await expect(client.chat(messages)).resolves.toBe('recovered');
        });

        describe('HALF_OPEN probe', () => {
            beforeEach(async () => {
                jest.useFakeTimers();
                mockMessagesCreate.mockRejectedValue(new Error('API Error'));
                for (let i = 0; i < 5; i++) {
                    await expect(client.chat(messages)).rejects.toThrow('API Error');
                }
                mockMessagesCreate.mockClear();
            });

            afterEach(() => {
                jest.useRealTimers();
            });

            it('should close after a successful probe', async () => {
                jest.advanceTimersByTime(61000);
                mockMessagesCreate.mockResolvedValue(textResponse('probe ok'));

                await expect(client.chat(messages)).resolves.toBe('probe ok');

                // Circuit is closed again — subsequent calls flow normally
                await expect(client.chat(messages)).resolves.toBe('probe ok');
                expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
            });

            it('should reopen when the probe fails', async () => {
                jest.advanceTimersByTime(61000);
                mockMessagesCreate.mockRejectedValue(new Error('still down'));

                await expect(client.chat(messages)).rejects.toThrow('still down');

                // Immediately OPEN again — no HTTP call
                await expect(client.chat(messages)).rejects.toThrow(CircuitOpenError);
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

                const probe = client.chat(messages);

                // Second call during the in-flight probe is rejected
                await expect(client.chat(messages)).rejects.toThrow(CircuitOpenError);

                resolveProbe!(textResponse('probe ok'));
                await expect(probe).resolves.toBe('probe ok');
                expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('SDK error propagation', () => {
        it('should propagate SDK errors untouched', async () => {
            const apiError = Object.assign(new Error('rate limited'), { status: 429 });
            mockMessagesCreate.mockRejectedValue(apiError);

            await expect(client.chat(messages)).rejects.toBe(apiError);
        });
    });
});
