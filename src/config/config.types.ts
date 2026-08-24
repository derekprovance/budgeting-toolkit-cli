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
    /**
     * Explicit income destinations. Empty (the default) derives them from
     * Firefly's account roles; non-empty overrides derivation entirely.
     */
    incomeDestinationAccounts: string[];
    /**
     * Explicit expense sources. Empty (the default) derives them from Firefly's
     * account roles; non-empty overrides derivation entirely.
     */
    expenseSourceAccounts: string[];
    expenseTransfers: ValidTransfer[];
    /**
     * Accounts outside the tracked boundary. Money crossing into them is not
     * spending and money generated inside them is not income — a brokerage is
     * the usual case. Excluded from both derived lists.
     */
    untrackedAccounts: string[];
    /**
     * Accounts a paycheck-tagged deposit must land in to count as a paycheck.
     * Empty means no constraint — the tag alone decides.
     */
    paycheckDestinationAccounts: string[];
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
    maxTokens: number;
    batchSize: number;
    maxConcurrent: number;
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
}

/**
 * Single source of truth for valid log levels.
 * The tuple is `as const` so its element type is a union of string literals.
 */
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Logging Configuration
 */
export interface LoggingConfig {
    level: LogLevel;
}
