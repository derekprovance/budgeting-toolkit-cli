import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../logger";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeConfig {
  // API and Client Configuration
  apiKey?: string;
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;

  // Model Configuration
  model?: string;

  // Message Parameters
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];

  // System Configuration
  systemPrompt?: string;
  metadata?: Record<string, string>;

  // Batch Processing Configuration
  batchSize?: number;
  maxConcurrent?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;

  // Function Calling Configuration
  functions?: Array<{
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
      }>;
      required: string[];
    };
  }>;
  function_call?: { name: string };
}

type RequiredClaudeConfig = Required<Omit<ClaudeConfig, 'functions' | 'function_call'>> & {
  functions?: ClaudeConfig['functions'];
  function_call?: ClaudeConfig['function_call'];
};

interface MessageCreateParams {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  top_p: number;
  top_k: number;
  stop_sequences: string[];
  system?: string;
  metadata?: Record<string, string>;
  tools?: Array<{
    name: string;
    description?: string;
    input_schema: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
      }>;
      required: string[];
    };
  }>;
  tool_choice?: {
    type: 'tool';
    name: string;
  };
}

export class ClaudeClient {
  private client: Anthropic;
  private config: RequiredClaudeConfig;
  private requestQueue: Promise<string>[] = [];

  private static DEFAULT_CONFIG: RequiredClaudeConfig = {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    baseURL: "https://api.anthropic.com",
    timeout: 30000,
    maxRetries: 3,
    model: "claude-3-5-haiku-latest",
    maxTokens: 1024,
    temperature: 0.2,
    topP: 1.0,
    topK: 5,
    stopSequences: [],
    systemPrompt: "",
    metadata: {},
    batchSize: 10,
    maxConcurrent: 5,
    retryDelayMs: 1000,
    maxRetryDelayMs: 32000,
  };

  constructor(config: ClaudeConfig = {}) {
    this.config = { ...ClaudeClient.DEFAULT_CONFIG, ...config };
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      maxRetries: this.config.maxRetries,
      timeout: this.config.timeout,
    });
    logger.debug(`Initializing AI Client using ${this.config.model}`);
  }

  async chatBatch(
    messageBatches: ChatMessage[][],
    overrideConfig?: Partial<ClaudeConfig>
  ): Promise<string[]> {
    const config = { ...this.config, ...overrideConfig };
    const results: string[] = [];
    const batches = this.chunkArray(messageBatches, config.batchSize);

    for (const batch of batches) {
      const batchPromises = batch.map((messages) =>
        this.processSingleChat(messages, config)
      );

      while (batchPromises.length > 0) {
        const chunk = batchPromises.splice(0, config.maxConcurrent);
        const chunkResults = await Promise.all(chunk);
        results.push(...chunkResults);
      }
    }

    return results;
  }

  async chat(
    messages: ChatMessage[],
    overrideConfig?: Partial<ClaudeConfig>
  ): Promise<string> {
    const config = { ...this.config, ...overrideConfig };
    const response = await this.processSingleChat(messages, config);

    return response;
  }

  updateConfig(newConfig: Partial<ClaudeConfig>): void {
    this.config = { ...this.config, ...newConfig };

    if (
      newConfig.apiKey ||
      newConfig.baseURL ||
      newConfig.timeout ||
      newConfig.maxRetries
    ) {
      this.client = new Anthropic({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        maxRetries: this.config.maxRetries,
        timeout: this.config.timeout,
      });
    }
  }

  getConfig(): Omit<RequiredClaudeConfig, "apiKey"> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { apiKey, ...safeConfig } = this.config;
    return safeConfig;
  }

  private async processSingleChat(
    messages: ChatMessage[],
    config: RequiredClaudeConfig
  ): Promise<string> {
    let attempt = 0;
    let request: Promise<string>;

    while (true) {
      try {
        if (this.requestQueue.length >= config.maxConcurrent) {
          await Promise.race(this.requestQueue);
        }

        request = this.makeRequest(messages, config);
        this.requestQueue.push(request);

        const response = await request;
        return response;
      } catch (error) {
        attempt++;

        if (attempt >= config.maxRetries) {
          throw error;
        }

        const delay = this.calculateBackoffDelay(
          attempt,
          config.retryDelayMs,
          config.maxRetryDelayMs
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      } finally {
        const index = this.requestQueue.findIndex((r) => r === request);
        if (index !== -1) {
          this.requestQueue.splice(index, 1);
        }
      }
    }
  }

  private calculateBackoffDelay(
    attempt: number,
    baseDelay: number,
    maxDelay: number
  ): number {
    const delay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * (baseDelay * 0.1);
    return Math.min(delay + jitter, maxDelay);
  }

  private async makeRequest(
    messages: ChatMessage[],
    config: RequiredClaudeConfig
  ): Promise<string> {
    const requestParams: MessageCreateParams = {
      model: config.model,
      messages: messages,
      max_tokens: 150,
      temperature: config.temperature,
      top_p: config.topP,
      top_k: config.topK,
      stop_sequences: config.stopSequences,
      system: config.systemPrompt,
      metadata: config.metadata,
    };

    if (config.functions) {
      requestParams.tools = config.functions.map(fn => ({
        name: fn.name,
        description: fn.description,
        input_schema: {
          type: 'object',
          properties: fn.parameters.properties,
          required: fn.parameters.required
        }
      }));
    }

    if (config.function_call) {
      requestParams.tool_choice = {
        type: 'tool',
        name: config.function_call.name
      };
    }

    const response = await this.client.messages.create(requestParams);

    const textContent = response.content
      .map((block) => this.getTextFromContentBlock(block))
      .filter((text) => text.length > 0)
      .join("\n");

    if (!textContent) {
      throw new Error("No text content found in response");
    }

    return textContent;
  }

  private getTextFromContentBlock(block: unknown): string {
    if (typeof block === 'object' && block !== null) {
      const b = block as { type?: string; text?: string; input?: unknown };
      if (b.type === "text" && typeof b.text === "string") {
        return b.text;
      }
      if (b.type === "tool_use" && b.input) {
        return JSON.stringify(b.input);
      }
    }
    return "";
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
