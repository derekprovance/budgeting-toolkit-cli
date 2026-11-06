import { AppConfig } from './config.types.js';

/** Lowest precedence, below environment variables and config.yaml. */
export const DEFAULT_CONFIG: AppConfig = {
    api: {
        firefly: {
            url: '',
            token: '',
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
        untrackedAccounts: [],
    },
    transactions: {
        expectedMonthlyPaycheck: undefined,
        excludedTransactions: [],
        tags: {
            disposableIncome: 'Disposable Income',
            paycheck: 'Paycheck',
        },
    },
    llm: {
        model: 'claude-sonnet-5',
        maxTokens: 16000,
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
    categorize: {
        historyMonths: 12,
    },
    logging: {
        level: 'silent',
    },
};
