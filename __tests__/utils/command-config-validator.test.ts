import { jest } from '@jest/globals';
import { CommandConfigValidator } from '../../src/utils/command-config-validator.js';
import { AppConfig } from '../../src/config/config.types.js';

describe('CommandConfigValidator', () => {
    let mockConsoleError: jest.SpiedFunction<typeof console.error>;
    let mockConsoleWarn: jest.SpiedFunction<typeof console.warn>;
    let mockProcessExit: jest.SpiedFunction<typeof process.exit>;

    beforeEach(() => {
        // Mock console methods
        mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Mock process.exit
        mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
            throw new Error(`process.exit(${code})`);
        }) as jest.SpiedFunction<typeof process.exit>;
    });

    afterEach(() => {
        mockConsoleError.mockRestore();
        mockConsoleWarn.mockRestore();
        mockProcessExit.mockRestore();
    });

    describe('validateFinalizeCommand', () => {
        it('should not throw when all required config is present', () => {
            const config: AppConfig = {
                api: {
                    firefly: {
                        url: 'http://localhost',
                        token: 'token',
                        noNameExpenseAccountId: '5',
                    },
                    claude: {
                        apiKey: '',
                        baseURL: 'https://api.anthropic.com',
                        timeout: 60000,
                        maxRetries: 3,
                    },
                },
                accounts: {
                    validDestinationAccounts: ['1'],
                    validExpenseAccounts: ['3'],
                    validTransfers: [],
                },
                transactions: {
                    expectedMonthlyPaycheck: 5000,
                    excludedAdditionalIncomePatterns: [],
                    excludeDisposableIncome: false,
                    excludedTransactions: [],
                    tags: { disposableIncome: 'Disposable Income', bills: 'Bills' },
                },
                llm: {
                    model: 'claude-3-5-sonnet-20241022',
                    temperature: 0.3,
                    maxTokens: 1024,
                    batchSize: 10,
                    maxConcurrent: 3,
                    retryDelayMs: 1000,
                    maxRetryDelayMs: 10000,
                    rateLimit: { maxTokensPerMinute: 50000, refillInterval: 1000 },
                    circuitBreaker: {
                        failureThreshold: 5,
                        resetTimeout: 60000,
                        halfOpenTimeout: 30000,
                    },
                },
                logging: { level: 'info' },
            };

            expect(() => CommandConfigValidator.validateFinalizeCommand(config)).not.toThrow();
            expect(mockConsoleError).not.toHaveBeenCalled();
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should exit when expectedMonthlyPaycheck is missing', () => {
            const config: AppConfig = {
                api: {
                    firefly: {
                        url: 'http://localhost',
                        token: 'token',
                        noNameExpenseAccountId: '5',
                    },
                    claude: {
                        apiKey: '',
                        baseURL: 'https://api.anthropic.com',
                        timeout: 60000,
                        maxRetries: 3,
                    },
                },
                accounts: {
                    validDestinationAccounts: ['1'],
                    validExpenseAccounts: ['3'],
                    validTransfers: [],
                },
                transactions: {
                    expectedMonthlyPaycheck: undefined,
                    excludedAdditionalIncomePatterns: [],
                    excludeDisposableIncome: false,
                    excludedTransactions: [],
                    tags: { disposableIncome: 'Disposable Income', bills: 'Bills' },
                },
                llm: {
                    model: 'claude-3-5-sonnet-20241022',
                    temperature: 0.3,
                    maxTokens: 1024,
                    batchSize: 10,
                    maxConcurrent: 3,
                    retryDelayMs: 1000,
                    maxRetryDelayMs: 10000,
                    rateLimit: { maxTokensPerMinute: 50000, refillInterval: 1000 },
                    circuitBreaker: {
                        failureThreshold: 5,
                        resetTimeout: 60000,
                        halfOpenTimeout: 30000,
                    },
                },
                logging: { level: 'info' },
            };

            expect(() => CommandConfigValidator.validateFinalizeCommand(config)).toThrow(
                'process.exit(1)'
            );
            expect(mockConsoleError).toHaveBeenCalled();
            const errorOutput = mockConsoleError.mock.calls.map(call => call.join(' ')).join('\n');
            expect(errorOutput).toContain('expectedMonthlyPaycheck is required');
            expect(errorOutput).toContain('config.yaml');
        });

        it('should exit when validDestinationAccounts is empty', () => {
            const config: AppConfig = {
                api: {
                    firefly: {
                        url: 'http://localhost',
                        token: 'token',
                        noNameExpenseAccountId: '5',
                    },
                    claude: {
                        apiKey: '',
                        baseURL: 'https://api.anthropic.com',
                        timeout: 60000,
                        maxRetries: 3,
                    },
                },
                accounts: {
                    validDestinationAccounts: [],
                    validExpenseAccounts: ['3'],
                    validTransfers: [],
                },
                transactions: {
                    expectedMonthlyPaycheck: 5000,
                    excludedAdditionalIncomePatterns: [],
                    excludeDisposableIncome: false,
                    excludedTransactions: [],
                    tags: { disposableIncome: 'Disposable Income', bills: 'Bills' },
                },
                llm: {
                    model: 'claude-3-5-sonnet-20241022',
                    temperature: 0.3,
                    maxTokens: 1024,
                    batchSize: 10,
                    maxConcurrent: 3,
                    retryDelayMs: 1000,
                    maxRetryDelayMs: 10000,
                    rateLimit: { maxTokensPerMinute: 50000, refillInterval: 1000 },
                    circuitBreaker: {
                        failureThreshold: 5,
                        resetTimeout: 60000,
                        halfOpenTimeout: 30000,
                    },
                },
                logging: { level: 'info' },
            };

            expect(() => CommandConfigValidator.validateFinalizeCommand(config)).toThrow(
                'process.exit(1)'
            );
            expect(mockConsoleError).toHaveBeenCalled();
            const errorOutput = mockConsoleError.mock.calls.map(call => call.join(' ')).join('\n');
            expect(errorOutput).toContain('validDestinationAccounts is required');
        });

        it('should exit when validExpenseAccounts is empty', () => {
            const config: AppConfig = {
                api: {
                    firefly: {
                        url: 'http://localhost',
                        token: 'token',
                        noNameExpenseAccountId: '5',
                    },
                    claude: {
                        apiKey: '',
                        baseURL: 'https://api.anthropic.com',
                        timeout: 60000,
                        maxRetries: 3,
                    },
                },
                accounts: {
                    validDestinationAccounts: ['1'],
                    validExpenseAccounts: [],
                    validTransfers: [],
                },
                transactions: {
                    expectedMonthlyPaycheck: 5000,
                    excludedAdditionalIncomePatterns: [],
                    excludeDisposableIncome: false,
                    excludedTransactions: [],
                    tags: { disposableIncome: 'Disposable Income', bills: 'Bills' },
                },
                llm: {
                    model: 'claude-3-5-sonnet-20241022',
                    temperature: 0.3,
                    maxTokens: 1024,
                    batchSize: 10,
                    maxConcurrent: 3,
                    retryDelayMs: 1000,
                    maxRetryDelayMs: 10000,
                    rateLimit: { maxTokensPerMinute: 50000, refillInterval: 1000 },
                    circuitBreaker: {
                        failureThreshold: 5,
                        resetTimeout: 60000,
                        halfOpenTimeout: 30000,
                    },
                },
                logging: { level: 'info' },
            };

            expect(() => CommandConfigValidator.validateFinalizeCommand(config)).toThrow(
                'process.exit(1)'
            );
            expect(mockConsoleError).toHaveBeenCalled();
            const errorOutput = mockConsoleError.mock.calls.map(call => call.join(' ')).join('\n');
            expect(errorOutput).toContain('validExpenseAccounts is required');
        });

        it('should report multiple validation errors at once', () => {
            const config: AppConfig = {
                api: {
                    firefly: {
                        url: 'http://localhost',
                        token: 'token',
                        noNameExpenseAccountId: '5',
                    },
                    claude: {
                        apiKey: '',
                        baseURL: 'https://api.anthropic.com',
                        timeout: 60000,
                        maxRetries: 3,
                    },
                },
                accounts: {
                    validDestinationAccounts: [],
                    validExpenseAccounts: [],
                    validTransfers: [],
                },
                transactions: {
                    expectedMonthlyPaycheck: undefined,
                    excludedAdditionalIncomePatterns: [],
                    excludeDisposableIncome: false,
                    excludedTransactions: [],
                    tags: { disposableIncome: 'Disposable Income', bills: 'Bills' },
                },
                llm: {
                    model: 'claude-3-5-sonnet-20241022',
                    temperature: 0.3,
                    maxTokens: 1024,
                    batchSize: 10,
                    maxConcurrent: 3,
                    retryDelayMs: 1000,
                    maxRetryDelayMs: 10000,
                    rateLimit: { maxTokensPerMinute: 50000, refillInterval: 1000 },
                    circuitBreaker: {
                        failureThreshold: 5,
                        resetTimeout: 60000,
                        halfOpenTimeout: 30000,
                    },
                },
                logging: { level: 'info' },
            };

            expect(() => CommandConfigValidator.validateFinalizeCommand(config)).toThrow(
                'process.exit(1)'
            );
            const errorOutput = mockConsoleError.mock.calls.map(call => call.join(' ')).join('\n');
            expect(errorOutput).toContain('expectedMonthlyPaycheck is required');
            expect(errorOutput).toContain('validDestinationAccounts is required');
            expect(errorOutput).toContain('validExpenseAccounts is required');
            expect(errorOutput).toContain('CONFIG.md');
        });
    });

    describe('validateCategorizeCommand', () => {
        it('should not throw when ANTHROPIC_API_KEY is present', () => {
            const config: AppConfig = {
                api: {
                    firefly: {
                        url: 'http://localhost',
                        token: 'token',
                        noNameExpenseAccountId: '5',
                    },
                    claude: {
                        apiKey: 'test-api-key',
                        baseURL: 'https://api.anthropic.com',
                        timeout: 60000,
                        maxRetries: 3,
                    },
                },
                accounts: {
                    validDestinationAccounts: [],
                    validExpenseAccounts: [],
                    validTransfers: [],
                },
                transactions: {
                    expectedMonthlyPaycheck: undefined,
                    excludedAdditionalIncomePatterns: [],
                    excludeDisposableIncome: false,
                    excludedTransactions: [],
                    tags: { disposableIncome: 'Disposable Income', bills: 'Bills' },
                },
                llm: {
                    model: 'claude-3-5-sonnet-20241022',
                    temperature: 0.3,
                    maxTokens: 1024,
                    batchSize: 10,
                    maxConcurrent: 3,
                    retryDelayMs: 1000,
                    maxRetryDelayMs: 10000,
                    rateLimit: { maxTokensPerMinute: 50000, refillInterval: 1000 },
                    circuitBreaker: {
                        failureThreshold: 5,
                        resetTimeout: 60000,
                        halfOpenTimeout: 30000,
                    },
                },
                logging: { level: 'info' },
            };

            expect(() => CommandConfigValidator.validateCategorizeCommand(config)).not.toThrow();
            expect(mockConsoleError).not.toHaveBeenCalled();
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should exit when ANTHROPIC_API_KEY is missing', () => {
            const config: AppConfig = {
                api: {
                    firefly: {
                        url: 'http://localhost',
                        token: 'token',
                        noNameExpenseAccountId: '5',
                    },
                    claude: {
                        apiKey: '',
                        baseURL: 'https://api.anthropic.com',
                        timeout: 60000,
                        maxRetries: 3,
                    },
                },
                accounts: {
                    validDestinationAccounts: [],
                    validExpenseAccounts: [],
                    validTransfers: [],
                },
                transactions: {
                    expectedMonthlyPaycheck: undefined,
                    excludedAdditionalIncomePatterns: [],
                    excludeDisposableIncome: false,
                    excludedTransactions: [],
                    tags: { disposableIncome: 'Disposable Income', bills: 'Bills' },
                },
                llm: {
                    model: 'claude-3-5-sonnet-20241022',
                    temperature: 0.3,
                    maxTokens: 1024,
                    batchSize: 10,
                    maxConcurrent: 3,
                    retryDelayMs: 1000,
                    maxRetryDelayMs: 10000,
                    rateLimit: { maxTokensPerMinute: 50000, refillInterval: 1000 },
                    circuitBreaker: {
                        failureThreshold: 5,
                        resetTimeout: 60000,
                        halfOpenTimeout: 30000,
                    },
                },
                logging: { level: 'info' },
            };

            expect(() => CommandConfigValidator.validateCategorizeCommand(config)).toThrow(
                'process.exit(1)'
            );
            expect(mockConsoleError).toHaveBeenCalled();
            const errorOutput = mockConsoleError.mock.calls.map(call => call.join(' ')).join('\n');
            expect(errorOutput).toContain('ANTHROPIC_API_KEY is required');
            expect(errorOutput).toContain('https://console.anthropic.com');
            expect(errorOutput).toContain('CONFIG.md');
        });
    });
});
