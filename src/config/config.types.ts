import { ValidTransfer } from '../types/common.types.js';

/**
 * Complete application configuration structure.
 * All configuration values are defined here for type safety and documentation.
 */
export interface AppConfig {
    api: ApiConfig;
    accounts: AccountsConfig;
    transactions: TransactionsConfig;
    llm: LLMConfig;
    logging: LoggingConfig;
}

/**
 * API Configuration for external services
 */
export interface ApiConfig {
    firefly: FireflyApiConfig;
    claude: ClaudeApiConfig;
}

/**
 * Firefly III API Configuration
 */
export interface FireflyApiConfig {
    url: string;
    token: string;
    certificates?: CertificateConfig;
    noNameExpenseAccountId: string;
}

/**
 * Certificate configuration for Firefly III client certificate authentication
 */
export interface CertificateConfig {
    caCertPath?: string;
    clientCertPath?: string;
    clientCertPassword?: string;
}

/**
 * Claude AI API Configuration
 */
export interface ClaudeApiConfig {
    apiKey: string;
    baseURL: string;
    timeout: number;
    maxRetries: number;
}

/**
 * Account Configuration for transaction filtering
 */
export interface AccountsConfig {
    validDestinationAccounts: string[];
    validExpenseAccounts: string[];
    validTransfers: ValidTransfer[];
    disposableIncomeAccounts: string[];
}

/**
 * Transaction Processing Configuration
 */
export interface TransactionsConfig {
    expectedMonthlyPaycheck?: number;
    excludedAdditionalIncomePatterns: string[];
    excludeDisposableIncome: boolean;
    excludedTransactions: ExcludedTransaction[];
    tags: TagsConfig;
}

/**
 * Excluded Transaction Configuration
 */
export interface ExcludedTransaction {
    description: string;
    amount?: string;
    reason?: string;
}

/**
 * Transaction Tags Configuration
 */
export interface TagsConfig {
    disposableIncome: string;
    paycheck: string;
}

/**
 * LLM (Large Language Model) Configuration
 */
export interface LLMConfig {
    model: string;
    temperature: number;
    maxTokens: number;
    batchSize: number;
    maxConcurrent: number;
    retryDelayMs: number;
    maxRetryDelayMs: number;
    rateLimit: RateLimitConfig;
    circuitBreaker: CircuitBreakerConfig;
}

/**
 * Rate Limiting Configuration for LLM requests
 */
export interface RateLimitConfig {
    maxTokensPerMinute: number;
    refillInterval: number;
}

/**
 * Circuit Breaker Configuration for LLM failure handling
 */
export interface CircuitBreakerConfig {
    failureThreshold: number;
    resetTimeout: number;
    halfOpenTimeout: number;
}

/**
 * Logging Configuration
 */
export interface LoggingConfig {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';
}
