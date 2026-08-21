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
        incomeDestinationAccounts: [],
        expenseSourceAccounts: [],
        expenseTransfers: [],
        disposableIncomeAccounts: [],
    },
    transactions: {
        expectedMonthlyPaycheck: undefined,
        excludedAdditionalIncomePatterns: [],
        excludeDisposableIncome: true,
        excludedTransactions: [],
        tags: {
            disposableIncome: 'Disposable Income',
            paycheck: 'Paycheck',
        },
    },
    llm: {
        model: 'claude-sonnet-5',
        maxTokens: 2000,
        batchSize: 10,
        maxConcurrent: 3,
        rateLimit: {
            maxTokensPerMinute: 50000,
            refillInterval: 60000,
        },
        circuitBreaker: {
            failureThreshold: 5,
            resetTimeout: 60000,
        },
    },
    logging: {
        level: 'silent',
    },
};
