import { jest } from '@jest/globals';
import { AppConfig } from '../../src/config/config.types.js';

// Mock fs module BEFORE importing ConfigValidator
const mockExistsSync = jest.fn<() => boolean>();
const mockAccessSync = jest.fn<() => void>();
const mockReadFileSync = jest.fn<() => string>();
jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync,
    accessSync: mockAccessSync,
    readFileSync: mockReadFileSync,
    constants: {
        R_OK: 4,
    },
    default: {
        existsSync: mockExistsSync,
        accessSync: mockAccessSync,
        readFileSync: mockReadFileSync,
        constants: {
            R_OK: 4,
        },
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
        mockAccessSync.mockReset();
        mockReadFileSync.mockReset();

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
            mockAccessSync.mockReturnValue(undefined);
            const validPemCert = `-----BEGIN CERTIFICATE-----
MIIC/zCCAeegAwIBAgIUF4AQS0bg3A3d5b2Hw/xqWezubKowDQYJKoZIhvcNAQEL
BQAwDzENMAsGA1UEAwwEdGVzdDAeFw0yNTEyMDkyMDQzMTFaFw0yNjEyMDkyMDQz
MTFaMA8xDTALBgNVBAMMBHRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDCecHz8BL2Nlh1c7Cnw0CHs2gE4aLGkLIigCFCsTW+jjWgHg5TvFuFWjxW
1+P0NtAzehatNLuqC/FsaUr+uTQ2AcdbQHvM5n1VvrCAcDG8zUNTq0flWmeqIkZQ
EK1HDuaa97VuFUb32jCfziXtaGe8X3lycteECxyvRUNI/+3XrRrkDzd+aEDuSjYU
Q7iJ4xRmqOBZITu/EHzi5Fad1RWjuehlshv4km87eM17QamPc6KwihrS0atatqa3
rHMN7X7C/ToH+J+UDz+nCbgPRtOlQ1qWkgRT+/ghSvDyS3IBQjQyOXTElj9incBt
VKiAjNF6akysN1qYuElGXpR+0DifAgMBAAGjUzBRMB0GA1UdDgQWBBTk29HZ8tif
hFHDmgfvIz3/8BAOFDAfBgNVHSMEGDAWgBTk29HZ8tifhFHDmgfvIz3/8BAOFDAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQB3uwRWIRlBEvHJuYeN
DtPoGRxz40Gtub0TdwZeijeF5uAE+JQoUgUrkyqihdvn0+5q1Y2gJarkWRjd2n4r
aEv6cz0uos54EREa2S/6B9kM3WdywscmWe4bBXcDuv8pX4+DsQKhIyL1qYX5Y9LA
HtlYo9qvGBgHFYQCpmYNYiGoj7Z1gGrK5orYBqg+FRscv4H5R2gvcspWL/rd4Cu7
m2kMFHexOHT+gEzRCpAo2AKos/N4DAB8HoRfIAgyrf9i+z5v7iBYW47p6n4AChVi
UNX55bDN8vWfo+f9xp6sXW7yMBTYwpJJJOOzP7jkv1YIsDv4OTzYFYlEwoAU0Lbb
qZXQ
-----END CERTIFICATE-----`;
            mockReadFileSync.mockReturnValue(validPemCert);

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
                expect(result.error.details.errors[0]).toContain(
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
            mockAccessSync.mockReturnValue(undefined);
            const validPemCert = `-----BEGIN CERTIFICATE-----
MIIC/zCCAeegAwIBAgIUF4AQS0bg3A3d5b2Hw/xqWezubKowDQYJKoZIhvcNAQEL
BQAwDzENMAsGA1UEAwwEdGVzdDAeFw0yNTEyMDkyMDQzMTFaFw0yNjEyMDkyMDQz
MTFaMA8xDTALBgNVBAMMBHRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDCecHz8BL2Nlh1c7Cnw0CHs2gE4aLGkLIigCFCsTW+jjWgHg5TvFuFWjxW
1+P0NtAzehatNLuqC/FsaUr+uTQ2AcdbQHvM5n1VvrCAcDG8zUNTq0flWmeqIkZQ
EK1HDuaa97VuFUb32jCfziXtaGe8X3lycteECxyvRUNI/+3XrRrkDzd+aEDuSjYU
Q7iJ4xRmqOBZITu/EHzi5Fad1RWjuehlshv4km87eM17QamPc6KwihrS0atatqa3
rHMN7X7C/ToH+J+UDz+nCbgPRtOlQ1qWkgRT+/ghSvDyS3IBQjQyOXTElj9incBt
VKiAjNF6akysN1qYuElGXpR+0DifAgMBAAGjUzBRMB0GA1UdDgQWBBTk29HZ8tif
hFHDmgfvIz3/8BAOFDAfBgNVHSMEGDAWgBTk29HZ8tifhFHDmgfvIz3/8BAOFDAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQB3uwRWIRlBEvHJuYeN
DtPoGRxz40Gtub0TdwZeijeF5uAE+JQoUgUrkyqihdvn0+5q1Y2gJarkWRjd2n4r
aEv6cz0uos54EREa2S/6B9kM3WdywscmWe4bBXcDuv8pX4+DsQKhIyL1qYX5Y9LA
HtlYo9qvGBgHFYQCpmYNYiGoj7Z1gGrK5orYBqg+FRscv4H5R2gvcspWL/rd4Cu7
m2kMFHexOHT+gEzRCpAo2AKos/N4DAB8HoRfIAgyrf9i+z5v7iBYW47p6n4AChVi
UNX55bDN8vWfo+f9xp6sXW7yMBTYwpJJJOOzP7jkv1YIsDv4OTzYFYlEwoAU0Lbb
qZXQ
-----END CERTIFICATE-----`;
            mockReadFileSync.mockReturnValue(validPemCert);

            const result = validator.validate(validConfig);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                // The error message now includes a multi-line string with suggestions
                const errorMessage = result.error.details.errors.find(e =>
                    e.includes('CA certificate not found: /path/to/missing/ca.pem')
                );
                expect(errorMessage).toBeDefined();
            }
        });

        it('should pass when both certificates exist', () => {
            validConfig.api.firefly.certificates = {
                clientCertPath: '/path/to/cert.pem',
                caCertPath: '/path/to/ca.pem',
                clientCertPassword: 'secret',
            };

            mockExistsSync.mockReturnValue(true);
            mockAccessSync.mockReturnValue(undefined);
            const validPemCert = `-----BEGIN CERTIFICATE-----
MIIC/zCCAeegAwIBAgIUF4AQS0bg3A3d5b2Hw/xqWezubKowDQYJKoZIhvcNAQEL
BQAwDzENMAsGA1UEAwwEdGVzdDAeFw0yNTEyMDkyMDQzMTFaFw0yNjEyMDkyMDQz
MTFaMA8xDTALBgNVBAMMBHRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDCecHz8BL2Nlh1c7Cnw0CHs2gE4aLGkLIigCFCsTW+jjWgHg5TvFuFWjxW
1+P0NtAzehatNLuqC/FsaUr+uTQ2AcdbQHvM5n1VvrCAcDG8zUNTq0flWmeqIkZQ
EK1HDuaa97VuFUb32jCfziXtaGe8X3lycteECxyvRUNI/+3XrRrkDzd+aEDuSjYU
Q7iJ4xRmqOBZITu/EHzi5Fad1RWjuehlshv4km87eM17QamPc6KwihrS0atatqa3
rHMN7X7C/ToH+J+UDz+nCbgPRtOlQ1qWkgRT+/ghSvDyS3IBQjQyOXTElj9incBt
VKiAjNF6akysN1qYuElGXpR+0DifAgMBAAGjUzBRMB0GA1UdDgQWBBTk29HZ8tif
hFHDmgfvIz3/8BAOFDAfBgNVHSMEGDAWgBTk29HZ8tifhFHDmgfvIz3/8BAOFDAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQB3uwRWIRlBEvHJuYeN
DtPoGRxz40Gtub0TdwZeijeF5uAE+JQoUgUrkyqihdvn0+5q1Y2gJarkWRjd2n4r
aEv6cz0uos54EREa2S/6B9kM3WdywscmWe4bBXcDuv8pX4+DsQKhIyL1qYX5Y9LA
HtlYo9qvGBgHFYQCpmYNYiGoj7Z1gGrK5orYBqg+FRscv4H5R2gvcspWL/rd4Cu7
m2kMFHexOHT+gEzRCpAo2AKos/N4DAB8HoRfIAgyrf9i+z5v7iBYW47p6n4AChVi
UNX55bDN8vWfo+f9xp6sXW7yMBTYwpJJJOOzP7jkv1YIsDv4OTzYFYlEwoAU0Lbb
qZXQ
-----END CERTIFICATE-----`;
            mockReadFileSync.mockReturnValue(validPemCert);

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
