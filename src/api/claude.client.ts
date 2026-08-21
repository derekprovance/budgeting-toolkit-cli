import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';
import { LLMConfig as LLMConfigType } from '../config/config.types.js';

/** Kept as an alias so call sites and tests keep their import */
export type ChatMessage = Anthropic.MessageParam;

export interface ClaudeClientConfig {
    apiKey?: string;
    baseURL?: string;
    /** Forwarded to the SDK client */
    timeout?: number;
    /** Retries after the first attempt — owned entirely by the SDK, which
     * honors retry-after and only retries retryable failures */
    maxRetries?: number;
    model: string;
    maxTokens: number;
}

export interface ChatOptions {
    systemPrompt?: string;
    tools?: Anthropic.Tool[];
    toolChoice?: Anthropic.ToolChoice;
    maxTokens?: number;
    model?: string;
}

/** Thrown when the circuit breaker rejects a request without calling the API */
export class CircuitOpenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CircuitOpenError';
    }
}

/** Thrown when a transport-successful response is unusable (truncated,
 * refused, or missing the forced tool call) */
export class ClaudeResponseError extends Error {
    constructor(
        public readonly reason: 'truncated' | 'refusal' | 'missing_tool_use' | 'empty',
        message: string
    ) {
        super(message);
        this.name = 'ClaudeResponseError';
    }
}

interface RateLimitState {
    tokens: number;
    lastRefill: number;
}

interface CircuitBreakerState {
    failures: number;
    lastFailureTime: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    probeInFlight: boolean;
}

export class ClaudeClient {
    private client: Anthropic;
    private config: Required<Pick<ClaudeClientConfig, 'model' | 'maxTokens'>> &
        Omit<ClaudeClientConfig, 'model' | 'maxTokens'>;
    private rateLimitState: RateLimitState;
    private circuitBreaker: CircuitBreakerState = {
        failures: 0,
        lastFailureTime: 0,
        state: 'CLOSED',
        probeInFlight: false,
    };

    // Minimal fallbacks for direct construction in tests; production always
    // passes model/maxTokens from configuration (see llm.config.ts)
    private static readonly DEFAULT_MODEL = 'claude-sonnet-5';
    private static readonly DEFAULT_MAX_TOKENS = 2000;

    constructor(
        config: Partial<ClaudeClientConfig> = {},
        client?: Anthropic,
        private readonly llmConfig?: LLMConfigType
    ) {
        this.config = {
            ...config,
            model: config.model ?? ClaudeClient.DEFAULT_MODEL,
            maxTokens: config.maxTokens ?? ClaudeClient.DEFAULT_MAX_TOKENS,
        };
        this.client =
            client ||
            new Anthropic({
                apiKey: this.config.apiKey || process.env.ANTHROPIC_API_KEY || '',
                baseURL: this.config.baseURL,
                maxRetries: this.config.maxRetries,
                timeout: this.config.timeout,
            });

        // Initialize rate limit state from config
        const maxTokens = this.llmConfig?.rateLimit?.maxTokensPerMinute ?? 50;
        this.rateLimitState = {
            tokens: maxTokens,
            lastRefill: Date.now(),
        };

        logger.debug(`Initializing AI Client with model: ${this.config.model}`);
    }

    /**
     * Sends one chat request. Transport retries are handled by the SDK; the
     * circuit breaker sees one failure per exhausted logical request.
     *
     * When a tool is forced via toolChoice, only the matching tool_use block
     * is returned (as JSON), ignoring any preamble text — mixed content must
     * never corrupt the structured payload.
     */
    async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
        this.assertCircuitAllows();
        await this.waitForRateLimit();

        let response: Anthropic.Message;
        try {
            response = await this.client.messages.create({
                model: options.model ?? this.config.model,
                max_tokens: options.maxTokens ?? this.config.maxTokens,
                messages,
                ...(options.systemPrompt && { system: options.systemPrompt }),
                ...(options.tools && { tools: options.tools }),
                ...(options.toolChoice && { tool_choice: options.toolChoice }),
            });
        } catch (error) {
            this.onRequestFailure();
            throw error;
        }

        // Transport succeeded — the breaker only tracks transport health.
        // Extraction failures below are semantic and must not open it.
        this.onRequestSuccess();

        const forcedToolName =
            options.toolChoice?.type === 'tool' ? options.toolChoice.name : undefined;
        return this.extractResult(response, forcedToolName);
    }

    private extractResult(response: Anthropic.Message, expectedToolName?: string): string {
        if (response.stop_reason === 'max_tokens') {
            throw new ClaudeResponseError(
                'truncated',
                'Response truncated at max_tokens — raise llm.maxTokens or lower llm.batchSize'
            );
        }
        if (response.stop_reason === 'refusal') {
            throw new ClaudeResponseError('refusal', 'Claude refused the request');
        }

        if (expectedToolName) {
            const toolBlock = response.content.find(
                (block): block is Anthropic.ToolUseBlock =>
                    block.type === 'tool_use' && block.name === expectedToolName
            );
            if (!toolBlock) {
                throw new ClaudeResponseError(
                    'missing_tool_use',
                    `Forced tool "${expectedToolName}" was not used in the response`
                );
            }
            return JSON.stringify(toolBlock.input);
        }

        const text = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map(block => block.text)
            .join('\n');

        if (!text) {
            throw new ClaudeResponseError('empty', 'No text content found in response');
        }

        return text;
    }

    private async waitForRateLimit(): Promise<void> {
        const REFILL_INTERVAL = this.llmConfig?.rateLimit?.refillInterval ?? 60000;
        const MAX_TOKENS = this.llmConfig?.rateLimit?.maxTokensPerMinute ?? 50;

        for (;;) {
            const now = Date.now();
            const timeSinceLastRefill = now - this.rateLimitState.lastRefill;

            if (timeSinceLastRefill >= REFILL_INTERVAL) {
                this.rateLimitState.tokens = MAX_TOKENS;
                this.rateLimitState.lastRefill = now;
            }

            if (this.rateLimitState.tokens > 0) {
                this.rateLimitState.tokens--;
                return;
            }

            const waitTime = Math.max(1, REFILL_INTERVAL - timeSinceLastRefill);
            logger.debug(
                { waitTime, tokens: this.rateLimitState.tokens },
                'Rate limit reached, waiting for refill'
            );
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    /**
     * Circuit breaker, consulted once per chat call:
     * - OPEN: reject until resetTimeout elapses, then allow one HALF_OPEN probe
     * - HALF_OPEN: exactly one probe in flight; success closes, failure reopens
     * - CLOSED: track consecutive failures; threshold opens the circuit
     */
    private assertCircuitAllows(): void {
        const now = Date.now();
        const RESET_TIMEOUT = this.llmConfig?.circuitBreaker?.resetTimeout ?? 60000;

        switch (this.circuitBreaker.state) {
            case 'OPEN':
                if (now - this.circuitBreaker.lastFailureTime > RESET_TIMEOUT) {
                    this.circuitBreaker.state = 'HALF_OPEN';
                    this.circuitBreaker.probeInFlight = true;
                    logger.debug('Circuit breaker moved to HALF_OPEN state (probe)');
                    return;
                }
                throw new CircuitOpenError('Circuit breaker is OPEN - API requests are blocked');

            case 'HALF_OPEN':
                if (this.circuitBreaker.probeInFlight) {
                    throw new CircuitOpenError(
                        'Circuit breaker is HALF_OPEN - probe already in flight'
                    );
                }
                this.circuitBreaker.probeInFlight = true;
                return;

            case 'CLOSED':
                return;
        }
    }

    private onRequestSuccess(): void {
        if (this.circuitBreaker.state === 'HALF_OPEN') {
            logger.debug('Circuit breaker reset to CLOSED after successful probe');
        }
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failures = 0;
        this.circuitBreaker.probeInFlight = false;
    }

    private onRequestFailure(): void {
        const FAILURE_THRESHOLD = this.llmConfig?.circuitBreaker?.failureThreshold ?? 5;
        this.circuitBreaker.lastFailureTime = Date.now();
        this.circuitBreaker.probeInFlight = false;

        if (this.circuitBreaker.state === 'HALF_OPEN') {
            this.circuitBreaker.state = 'OPEN';
            logger.warn('Circuit breaker probe failed, back to OPEN');
            return;
        }

        this.circuitBreaker.failures++;
        if (this.circuitBreaker.failures >= FAILURE_THRESHOLD) {
            this.circuitBreaker.state = 'OPEN';
            logger.warn('Circuit breaker moved to OPEN state due to failures');
            return;
        }

        logger.warn(
            {
                failures: this.circuitBreaker.failures,
                state: this.circuitBreaker.state,
            },
            'Request failed, updating circuit breaker'
        );
    }
}
