export interface AppConfig {
    api: ApiConfig;
    accounts: AccountsConfig;
    transactions: TransactionsConfig;
    llm: LLMConfig;
    categorize: CategorizeConfig;
    logging: LoggingConfig;
}

export interface CategorizeConfig {
    /**
     * Months back to look for an earlier transaction with the same description, whose
     * category and budget are suggested instead of asking the AI. 0 disables history.
     */
    historyMonths: number;
}

export interface ApiConfig {
    firefly: FireflyApiConfig;
    claude: ClaudeApiConfig;
}

export interface FireflyApiConfig {
    url: string;
    token: string;
    certificates?: CertificateConfig;
}

export interface CertificateConfig {
    caCertPath?: string;
    clientCertPath?: string;
    clientCertPassword?: string;
}

export interface ClaudeApiConfig {
    apiKey: string;
    baseURL: string;
    timeout: number;
    maxRetries: number;
}

export interface AccountsConfig {
    /**
     * R-SCOPE-1: accounts outside the cost-of-living envelope. Every other asset account
     * (closed ones included) is inside it; this is the only setting that draws the envelope.
     */
    untrackedAccounts: string[];
}

export interface TransactionsConfig {
    expectedMonthlyPaycheck?: number;
    excludedTransactions: ExcludedTransaction[];
    tags: TagsConfig;
}

/**
 * R-EXCL-1: applied at fetch time, so a match drops the transaction from every bucket in
 * every command.
 *
 * - `description` is required and matched whole-string after trim and lower-case, not as a
 *   substring.
 * - `amount` narrows the rule to one amount; currency formatting is accepted and the
 *   comparison is on absolute value, so it ignores direction.
 * - `reason` is never read.
 *
 * Amount-only rules are rejected by `ConfigValidator`: they would drop every transaction of
 * that amount, on any account, in either direction.
 */
export interface ExcludedTransaction {
    description: string;
    amount?: string;
    reason?: string;
}

export interface TagsConfig {
    disposableIncome: string;
    paycheck: string;
}

export interface LLMConfig {
    model: string;
    maxTokens: number;
    batchSize: number;
    maxConcurrent: number;
    rateLimit: RateLimitConfig;
    circuitBreaker: CircuitBreakerConfig;
}

export interface RateLimitConfig {
    maxTokensPerMinute: number;
    refillInterval: number;
}

export interface CircuitBreakerConfig {
    failureThreshold: number;
    resetTimeout: number;
}

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LoggingConfig {
    level: LogLevel;
}
