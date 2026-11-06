import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';
import { ClaudeApiConfig, LLMConfig } from '../config/config.types.js';

export interface ClaudeClientConfig {
    /** `maxRetries` is owned entirely by the SDK, which honors retry-after */
    api: ClaudeApiConfig;
    llm: LLMConfig;
}

export interface ToolCall {
    systemPrompt: string;
    userPrompt: string;
    /** Forced: the model must answer by calling this tool */
    tool: Anthropic.Tool;
}

/**
 * Current models think adaptively when `thinking` is omitted, drawing from `max_tokens`; on a
 * forced-tool classification that buys nothing and can exhaust the budget before any answer.
 * `thinking: { type: 'disabled' }` is rejected by some current models, a low effort by none.
 */
const EFFORT: NonNullable<Anthropic.OutputConfig['effort']> = 'low';

/** Thrown when the circuit breaker rejects a request without calling the API */
export class CircuitOpenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CircuitOpenError';
    }
}

/** Thrown when a transport-successful response is truncated, refused or lacks the tool call */
export class ClaudeResponseError extends Error {
    constructor(
        public readonly reason: 'truncated' | 'refusal' | 'missing_tool_use',
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
    /** Set once a model rejects output_config, so later chunks skip it */
    private effortUnsupported = false;

    private readonly client: Anthropic;
    private readonly llmConfig: LLMConfig;
    private rateLimitState: RateLimitState;
    private circuitBreaker: CircuitBreakerState = {
        failures: 0,
        lastFailureTime: 0,
        state: 'CLOSED',
        probeInFlight: false,
    };

    /** @param client Replaces the SDK client built from `config.api`; tests pass a fake */
    constructor(config: ClaudeClientConfig, client?: Anthropic) {
        this.llmConfig = config.llm;
        this.client =
            client ??
            new Anthropic({
                apiKey: config.api.apiKey,
                baseURL: config.api.baseURL,
                maxRetries: config.api.maxRetries,
                timeout: config.api.timeout,
            });
        this.rateLimitState = {
            tokens: this.llmConfig.rateLimit.maxTokensPerMinute,
            lastRefill: Date.now(),
        };

        logger.debug(`Initializing AI Client with model: ${this.llmConfig.model}`);
    }

    /**
     * Returns the forced tool call's input as JSON; preamble text is ignored. The circuit
     * breaker sees one failure per logical request, after the SDK's retries.
     *
     * @throws ClaudeResponseError when the response is truncated, refused or lacks the tool
     *   call; CircuitOpenError when the breaker is open
     */
    async callTool(call: ToolCall): Promise<string> {
        this.assertCircuitAllows();
        await this.waitForRateLimit();

        const request: Anthropic.MessageCreateParamsNonStreaming = {
            model: this.llmConfig.model,
            max_tokens: this.llmConfig.maxTokens,
            messages: [{ role: 'user', content: call.userPrompt }],
            system: call.systemPrompt,
            tools: [call.tool],
            tool_choice: { type: 'tool', name: call.tool.name },
        };

        let response: Anthropic.Message;
        try {
            response = await this.client.messages.create(
                this.effortUnsupported ? request : { ...request, output_config: { effort: EFFORT } }
            );
        } catch (error) {
            // Older models reject `output_config.effort`, and a bad request aborts the whole
            // run, so retry once without it. Any other bad request fails again immediately.
            if (error instanceof Anthropic.BadRequestError && !this.effortUnsupported) {
                this.effortUnsupported = true;
                logger.warn(
                    { model: request.model, error: error.message },
                    'Model rejected output_config.effort - retrying without it for the rest of this run'
                );

                try {
                    response = await this.client.messages.create(request);
                } catch (retryError) {
                    this.onRequestFailure();
                    throw retryError;
                }
            } else {
                this.onRequestFailure();
                throw error;
            }
        }

        // The breaker tracks transport health only; extraction failures must not open it
        this.onRequestSuccess();

        return this.extractToolInput(response, call.tool.name);
    }

    private extractToolInput(response: Anthropic.Message, toolName: string): string {
        if (response.stop_reason === 'max_tokens') {
            throw new ClaudeResponseError(
                'truncated',
                'Response truncated at max_tokens — raise llm.maxTokens or lower llm.batchSize'
            );
        }
        if (response.stop_reason === 'refusal') {
            throw new ClaudeResponseError('refusal', 'Claude refused the request');
        }

        const toolBlock = response.content.find(
            (block): block is Anthropic.ToolUseBlock =>
                block.type === 'tool_use' && block.name === toolName
        );
        if (!toolBlock) {
            throw new ClaudeResponseError(
                'missing_tool_use',
                `Forced tool "${toolName}" was not used in the response`
            );
        }
        return JSON.stringify(toolBlock.input);
    }

    private async waitForRateLimit(): Promise<void> {
        const { refillInterval: REFILL_INTERVAL, maxTokensPerMinute: MAX_TOKENS } =
            this.llmConfig.rateLimit;

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
        const RESET_TIMEOUT = this.llmConfig.circuitBreaker.resetTimeout;

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
        const FAILURE_THRESHOLD = this.llmConfig.circuitBreaker.failureThreshold;
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
