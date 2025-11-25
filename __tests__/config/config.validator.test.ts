import { jest } from '@jest/globals';
import { AppConfig } from '../../src/config/config.types.js';

// Mock fs module BEFORE importing ConfigValidator
const mockExistsSync = jest.fn<() => boolean>();
jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync,
    default: {
        existsSync: mockExistsSync,
    },
}));

// Import ConfigValidator after mock is set up
const { ConfigValidator } = await import('../../src/config/config.validator.js');

describe('ConfigValidator', () => {
    let validator: ConfigValidator;
    let validConfig: AppConfig;

    beforeEach(() => {
        validator = new ConfigValidator();
        mockExistsSync.mockReset();

        // Base valid configuration
        validConfig = {
            api: {
                firefly: {
                    url: 'http://localhost:8080',
                    token: 'test-token',
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
                validDestinationAccounts: ['1'],
                validExpenseAccounts: ['3'],
                validTransfers: [],
            },
            transactions: {
                expectedMonthlyPaycheck: 5000,
                excludedAdditionalIncomePatterns: [],
                excludeDisposableIncome: false,
                excludedTransactions: [],
                tags: {
                    disposableIncome: 'Disposable Income',
                    bills: 'Bills',
                },
            },
            llm: {
                model: 'claude-3-5-sonnet-20241022',
                temperature: 0.5,
                maxTokens: 1024,
                batchSize: 10,
                maxConcurrent: 3,
                retryDelayMs: 1000,
                maxRetryDelayMs: 10000,
                rateLimit: {
                    maxTokensPerMinute: 50000,
                    refillInterval: 1000,
                },
                circuitBreaker: {
                    failureThreshold: 5,
                    resetTimeout: 60000,
                    halfOpenTimeout: 30000,
                },
            },
            logging: {
                level: 'info',
            },
        };
    });

    describe('Firefly API validation', () => {
        it('should pass with valid Firefly API configuration', () => {
            const result = validator.validate(validConfig);

            expect(result.ok).toBe(true);
        });

        it('should fail when FIREFLY_API_URL is missing', () => {
            validConfig.api.firefly.url = '';

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.details.errors).toContain('FIREFLY_API_URL is required');
            }
        });

        it('should fail when FIREFLY_API_URL is invalid', () => {
            validConfig.api.firefly.url = 'not-a-valid-url';

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.details.errors).toContain(
                    'FIREFLY_API_URL must be a valid URL'
                );
            }
        });

        it('should fail when FIREFLY_API_TOKEN is missing', () => {
            validConfig.api.firefly.token = '';

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.details.errors).toContain('FIREFLY_API_TOKEN is required');
            }
        });

        it('should accept valid URL formats', () => {
            const urls = [
                'http://localhost:8080',
                'https://firefly.example.com',
                'http://192.168.1.100:8080/firefly',
                'https://firefly.example.com/api/v1',
            ];

            urls.forEach(url => {
                validConfig.api.firefly.url = url;
                const result = validator.validate(validConfig);
                expect(result.ok).toBe(true);
            });
        });
    });

    describe('Claude API validation', () => {
        it('should pass with valid Claude API configuration', () => {
            const result = validator.validate(validConfig);

            expect(result.ok).toBe(true);
        });

        it('should pass when Claude API key is missing (validated by command)', () => {
            validConfig.api.claude.apiKey = '';

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(true);
        });
    });

    describe('Logging configuration validation', () => {
        it('should pass with valid log levels', () => {
            const validLevels = ['trace', 'debug', 'info', 'warn', 'error', 'silent'];

            validLevels.forEach(level => {
                validConfig.logging.level = level as any;
                const result = validator.validate(validConfig);
                expect(result.ok).toBe(true);
            });
        });

        it('should fail with invalid log level', () => {
            validConfig.logging.level = 'invalid' as any;

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.details.errors).toContain(
                    'logging.level must be one of: trace, debug, info, warn, error, silent'
                );
            }
        });
    });

    describe('Certificate validation', () => {
        it('should pass when certificates are not configured', () => {
            delete validConfig.api.firefly.certificates;

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(true);
        });

        it('should pass when clientCertPath exists', () => {
            validConfig.api.firefly.certificates = {
                clientCertPath: '/path/to/cert.pem',
            };

            mockExistsSync.mockReturnValue(true);

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(true);
            expect(mockExistsSync).toHaveBeenCalledWith('/path/to/cert.pem');
        });

        it('should fail when clientCertPath does not exist', () => {
            validConfig.api.firefly.certificates = {
                clientCertPath: '/path/to/missing/cert.pem',
            };

            mockExistsSync.mockReturnValue(false);

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.details.errors).toContain(
                    'Client certificate not found: /path/to/missing/cert.pem'
                );
            }
        });

        it('should fail when caCertPath does not exist', () => {
            validConfig.api.firefly.certificates = {
                clientCertPath: '/path/to/cert.pem',
                caCertPath: '/path/to/missing/ca.pem',
            };

            mockExistsSync.mockImplementation((path: any) => {
                return path === '/path/to/cert.pem';
            });

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.details.errors).toContain(
                    'CA certificate not found: /path/to/missing/ca.pem'
                );
            }
        });

        it('should pass when both certificates exist', () => {
            validConfig.api.firefly.certificates = {
                clientCertPath: '/path/to/cert.pem',
                caCertPath: '/path/to/ca.pem',
                clientCertPassword: 'secret',
            };

            mockExistsSync.mockReturnValue(true);

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(true);
        });
    });

    describe('Multiple errors', () => {
        it('should collect all validation errors', () => {
            validConfig.api.firefly.url = '';
            validConfig.api.firefly.token = '';
            validConfig.logging.level = 'invalid' as any;

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.details.errors).toHaveLength(3);
                expect(result.error.details.errors).toContain('FIREFLY_API_URL is required');
                expect(result.error.details.errors).toContain('FIREFLY_API_TOKEN is required');
                expect(result.error.details.errors).toContain(
                    'logging.level must be one of: trace, debug, info, warn, error, silent'
                );
            }
        });

        it('should return user-friendly error message', () => {
            validConfig.api.firefly.url = '';

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe('configuration');
                expect(result.error.message).toBe('Configuration validation failed');
                expect(result.error.userMessage).toContain(
                    'Invalid configuration detected. Please check your .env and YAML config files.'
                );
            }
        });
    });
});
