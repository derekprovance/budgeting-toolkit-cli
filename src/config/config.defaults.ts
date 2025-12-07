import { AppConfig } from './config.types.js';

/**
 * Default configuration values for the application.
 *
 * This is the single source of truth for all default values.
 *
 * Precedence order:
 * 1. YAML configuration (config.yaml)
 * 2. Environment variables (.env)
 * 3. These defaults (lowest priority)
 */
export const DEFAULT_CONFIG: AppConfig = {
    api: {
        firefly: {
            url: '',
            token: '',
            noNameExpenseAccountId: '5',
            certificates: {
                caCertPath: undefined,
                clientCertPath: undefined,
                clientCertPassword: undefined,
            },
        },
        claude: {
            apiKey: '',
            baseURL: 'https://api.anthropic.com',
            timeout: 30000,
            maxRetries: 3,
        },
    },
    accounts: {
        validDestinationAccounts: [],
        validExpenseAccounts: [],
        validTransfers: [],
        disposableIncomeAccounts: [],
    },
    transactions: {
        expectedMonthlyPaycheck: undefined,
        excludedAdditionalIncomePatterns: [],
        excludeDisposableIncome: true,
        excludedTransactions: [],
        tags: {
            disposableIncome: 'Disposable Income',
        },
    },
    llm: {
        model: 'claude-sonnet-4-5',
        temperature: 0.2,
        maxTokens: 2000,
        batchSize: 10,
        maxConcurrent: 3,
        retryDelayMs: 1500,
        maxRetryDelayMs: 32000,
        rateLimit: {
            maxTokensPerMinute: 50000,
            refillInterval: 60000,
        },
        circuitBreaker: {
            failureThreshold: 5,
            resetTimeout: 60000,
            halfOpenTimeout: 30000,
        },
    },
    logging: {
        level: 'silent',
    },
};
