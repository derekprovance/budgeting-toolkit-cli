/**
 * Complete application configuration structure.
 * All configuration values are defined here for type safety and documentation.
 */
export interface AppConfig {
    api: ApiConfig;
    accounts: AccountsConfig;
    transactions: TransactionsConfig;
    llm: LLMConfig;
    categorize: CategorizeConfig;
    logging: LoggingConfig;
}

/**
 * `categorize` command configuration
 */
export interface CategorizeConfig {
    /**
     * How many months back to look for an earlier transaction with the same
     * description, whose category and budget are suggested instead of asking
     * the AI. 0 disables history.
     */
    historyMonths: number;
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
 * Account Configuration. See RULES.md, R-SCOPE-1.
 */
export interface AccountsConfig {
    /**
     * Accounts outside the cost-of-living envelope: savings, a brokerage, the
     * disposable pool. Every other asset account (closed ones included) is inside it. This is
     * the only setting that draws the envelope; income accounts (the envelope
     * minus credit cards) are derived from it.
     */
    untrackedAccounts: string[];
}

/**
 * Transaction Processing Configuration
 */
export interface TransactionsConfig {
    expectedMonthlyPaycheck?: number;
    excludedTransactions: ExcludedTransaction[];
    tags: TagsConfig;
}

/**
 * A rule that removes matching transactions from every report.
 *
 * Exclusion is applied at fetch time, so a match drops the transaction from
 * every bucket in every command — not just the one you had in mind. The schema
 * is deliberately narrow to keep that blunt instrument aimed:
 *
 * - `description` is REQUIRED and matched as whole-string equality, after
 *   trimming and lower-casing (`StringUtils.normalizeForMatching`). It is not a
 *   substring match.
 * - `amount` is optional and narrows a rule to a single amount. Currency
 *   formatting (`$`, thousands separators, accounting parentheses) is accepted,
 *   and the comparison is on absolute value, so it ignores direction.
 * - `reason` is free text for your own benefit; nothing reads it.
 *
 * Amount-only rules are NOT supported: they would silently drop every
 * transaction of that amount, on any account, in either direction.
 * `ConfigValidator` rejects them at startup.
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
