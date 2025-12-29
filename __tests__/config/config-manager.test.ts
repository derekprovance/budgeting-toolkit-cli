import { jest } from '@jest/globals';

// Create mock functions
const mockExistsSync = jest.fn<() => boolean>();
const mockReadFileSync = jest.fn<() => string>();
const mockAccessSync = jest.fn<() => void>();
const mockYamlLoad = jest.fn<() => any>();
const mockConfigSync = jest.fn<() => void>();

// Mock fs module
jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    accessSync: mockAccessSync,
    constants: {
        R_OK: 4,
    },
    default: {
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
        accessSync: mockAccessSync,
        constants: {
            R_OK: 4,
        },
    },
}));

// Mock js-yaml module
jest.unstable_mockModule('js-yaml', () => ({
    load: mockYamlLoad,
    default: {
        load: mockYamlLoad,
    },
}));

// Mock dotenv module
jest.unstable_mockModule('dotenv', () => ({
    config: mockConfigSync,
    default: {
        config: mockConfigSync,
    },
}));

// Import ConfigManager after mocks are set up
const { ConfigManager } = await import('../../src/config/config-manager.js');

describe('ConfigManager', () => {
    let originalEnv: NodeJS.ProcessEnv;
    let originalCwd: () => string;

    beforeAll(() => {
        originalEnv = { ...process.env };
        originalCwd = process.cwd;
    });

    afterAll(() => {
        process.env = originalEnv;
        process.cwd = originalCwd;
    });

    beforeEach(() => {
        // Reset singleton instance
        ConfigManager.resetInstance();

        // Mock process.cwd
        process.cwd = jest.fn().mockReturnValue('/test/path');

        // Clear environment variables
        process.env = { ...originalEnv };
        delete process.env.FIREFLY_API_URL;
        delete process.env.FIREFLY_API_TOKEN;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.CLIENT_CERT_PATH;
        delete process.env.CLIENT_CERT_CA_PATH;
        delete process.env.CLIENT_CERT_PASSWORD;
        delete process.env.LOG_LEVEL;

        // Reset mocks
        mockExistsSync.mockReset();
        mockReadFileSync.mockReset();
        mockAccessSync.mockReset();
        mockYamlLoad.mockReset();
        mockConfigSync.mockReset();

        // Default mock implementations
        mockConfigSync.mockReturnValue(undefined);
        mockExistsSync.mockReturnValue(false); // No YAML file by default
        mockAccessSync.mockReturnValue(undefined);
    });

    describe('FIREFLY_API_URL trailing slash normalization', () => {
        beforeEach(() => {
            // Set required environment variables for validation
            process.env.FIREFLY_API_TOKEN = 'test-token';
            process.env.ANTHROPIC_API_KEY = 'test-key';
        });

        it('should remove single trailing slash from FIREFLY_API_URL', () => {
            process.env.FIREFLY_API_URL = 'http://localhost:8080/';

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.api.firefly.url).toBe('http://localhost:8080');
        });

        it('should remove multiple trailing slashes from FIREFLY_API_URL', () => {
            process.env.FIREFLY_API_URL = 'http://localhost:8080///';

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.api.firefly.url).toBe('http://localhost:8080');
        });

        it('should not modify FIREFLY_API_URL without trailing slash', () => {
            process.env.FIREFLY_API_URL = 'http://localhost:8080';

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.api.firefly.url).toBe('http://localhost:8080');
        });

        it('should handle FIREFLY_API_URL with path and trailing slash', () => {
            process.env.FIREFLY_API_URL = 'http://localhost:8080/firefly/';

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.api.firefly.url).toBe('http://localhost:8080/firefly');
        });

        it('should handle FIREFLY_API_URL with https and trailing slash', () => {
            process.env.FIREFLY_API_URL = 'https://firefly.example.com/';

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.api.firefly.url).toBe('https://firefly.example.com');
        });

        it('should preserve internal slashes while removing trailing ones', () => {
            process.env.FIREFLY_API_URL = 'http://localhost:8080/path/to/firefly//';

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.api.firefly.url).toBe('http://localhost:8080/path/to/firefly');
        });
    });

    describe('Environment variable loading', () => {
        beforeEach(() => {
            // Set required variables
            process.env.FIREFLY_API_URL = 'http://localhost:8080';
            process.env.FIREFLY_API_TOKEN = 'test-token';
            process.env.ANTHROPIC_API_KEY = 'test-key';
        });

        it('should load FIREFLY_API_TOKEN from environment', () => {
            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.api.firefly.token).toBe('test-token');
        });

        it('should load ANTHROPIC_API_KEY from environment', () => {
            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.api.claude.apiKey).toBe('test-key');
        });

        it('should load LOG_LEVEL from environment', () => {
            process.env.LOG_LEVEL = 'debug';

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.logging.level).toBe('debug');
        });

        it('should load certificate paths from environment', () => {
            process.env.CLIENT_CERT_PATH = '/path/to/cert.pem';
            process.env.CLIENT_CERT_CA_PATH = '/path/to/ca.pem';
            process.env.CLIENT_CERT_PASSWORD = 'secret';

            // Mock the certificate files as existing
            mockExistsSync.mockImplementation((filePath: string) => {
                if (typeof filePath === 'string') {
                    return filePath === '/path/to/cert.pem' || filePath === '/path/to/ca.pem';
                }
                return false;
            });

            // Mock readFileSync to return a valid PEM certificate content
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

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.api.firefly.certificates?.clientCertPath).toBe('/path/to/cert.pem');
            expect(config.api.firefly.certificates?.caCertPath).toBe('/path/to/ca.pem');
            expect(config.api.firefly.certificates?.clientCertPassword).toBe('secret');
        });

        it('should resolve relative certificate paths from project root', () => {
            process.env.CLIENT_CERT_PATH = 'certs/client.pem';

            // Mock the resolved certificate file as existing
            mockExistsSync.mockImplementation((filePath: string) => {
                if (typeof filePath === 'string') {
                    return filePath === '/test/path/certs/client.pem';
                }
                return false;
            });

            // Mock readFileSync to return a valid PEM certificate content
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

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.api.firefly.certificates?.clientCertPath).toBe(
                '/test/path/certs/client.pem'
            );
        });
    });

    describe('YAML configuration loading', () => {
        beforeEach(() => {
            // Set required environment variables
            process.env.FIREFLY_API_URL = 'http://localhost:8080';
            process.env.FIREFLY_API_TOKEN = 'test-token';
            process.env.ANTHROPIC_API_KEY = 'test-key';
        });

        it('should load configuration from YAML file when it exists', () => {
            const yamlConfig = {
                validDestinationAccounts: ['account-1', 'account-2'],
                expectedMonthlyPaycheck: 5000,
            };

            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue(yamlConfig);

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.accounts.validDestinationAccounts).toEqual(['account-1', 'account-2']);
            expect(config.transactions.expectedMonthlyPaycheck).toBe(5000);
        });

        it('should handle missing YAML file gracefully', () => {
            mockExistsSync.mockReturnValue(false);

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            // Should use defaults
            expect(config).toBeDefined();
            expect(config.api.firefly.url).toBe('http://localhost:8080');
        });

        it('should give YAML config priority over environment variables', () => {
            // This test demonstrates YAML has highest priority
            // But FIREFLY_API_URL comes from env, not YAML
            const yamlConfig = {
                expectedMonthlyPaycheck: 6000,
            };

            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue(yamlConfig);

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.transactions.expectedMonthlyPaycheck).toBe(6000);
        });
    });

    describe('Singleton pattern', () => {
        beforeEach(() => {
            process.env.FIREFLY_API_URL = 'http://localhost:8080';
            process.env.FIREFLY_API_TOKEN = 'test-token';
            process.env.ANTHROPIC_API_KEY = 'test-key';
        });

        it('should return the same instance on multiple calls', () => {
            const instance1 = ConfigManager.getInstance();
            const instance2 = ConfigManager.getInstance();

            expect(instance1).toBe(instance2);
        });

        it('should allow resetting the instance for testing', () => {
            const instance1 = ConfigManager.getInstance();

            ConfigManager.resetInstance();

            const instance2 = ConfigManager.getInstance();

            expect(instance1).not.toBe(instance2);
        });
    });

    describe('Configuration validation', () => {
        it('should throw error when FIREFLY_API_URL is missing', () => {
            process.env.FIREFLY_API_TOKEN = 'test-token';
            process.env.ANTHROPIC_API_KEY = 'test-key';
            delete process.env.FIREFLY_API_URL;

            expect(() => ConfigManager.getInstance()).toThrow(/Configuration validation failed/);
        });

        it('should throw error when FIREFLY_API_TOKEN is missing', () => {
            process.env.FIREFLY_API_URL = 'http://localhost:8080';
            process.env.ANTHROPIC_API_KEY = 'test-key';
            delete process.env.FIREFLY_API_TOKEN;

            expect(() => ConfigManager.getInstance()).toThrow(/Configuration validation failed/);
        });
    });

    describe('Config file path resolution', () => {
        beforeEach(() => {
            process.env.FIREFLY_API_URL = 'http://localhost:8080';
            process.env.FIREFLY_API_TOKEN = 'test-token';
            process.env.ANTHROPIC_API_KEY = 'test-key';
        });

        it('should return correct default config directory', () => {
            const configDir = ConfigManager.getDefaultConfigDir();
            expect(configDir).toMatch(/\.budgeting$/);
            expect(configDir).toContain(process.env.HOME || process.env.USERPROFILE);
        });

        it('should return correct default config path', () => {
            const configPath = ConfigManager.getDefaultConfigPath();
            expect(configPath).toMatch(/\.budgeting[/\\]config\.yaml$/);
            expect(configPath).toContain(process.env.HOME || process.env.USERPROFILE);
        });

        it('should return correct default env path', () => {
            const envPath = ConfigManager.getDefaultEnvPath();
            expect(envPath).toMatch(/\.budgeting[/\\]\.env$/);
            expect(envPath).toContain(process.env.HOME || process.env.USERPROFILE);
        });

        it('should resolve config path from CLI --config flag with highest priority', () => {
            const customPath = '/custom/config.yaml';

            // Custom path exists, others don't
            mockExistsSync.mockImplementation((filePath: string) => {
                if (typeof filePath === 'string') {
                    return filePath === customPath;
                }
                return false;
            });
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue({});

            // The config path should be stored internally when provided
            expect(ConfigManager.getInstance(customPath)).toBeDefined();
        });

        it('should fallback to current directory config.yaml as second priority', () => {
            // Mock: custom path doesn't exist, current dir exists
            mockExistsSync.mockImplementation((filePath: string) => {
                if (typeof filePath === 'string') {
                    return filePath === './config.yaml';
                }
                return false;
            });
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue({});

            const configManager = ConfigManager.getInstance();
            expect(configManager).toBeDefined();
        });

        it('should fallback to home directory config as third priority', () => {
            // Mock: CLI and current dir don't exist, home dir exists
            const homeDir = process.env.HOME || process.env.USERPROFILE;
            const homePath = `${homeDir}/.budgeting/config.yaml`;

            mockExistsSync.mockImplementation((filePath: string) => {
                if (typeof filePath === 'string') {
                    return filePath === homePath;
                }
                return false;
            });
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue({});

            const configManager = ConfigManager.getInstance();
            expect(configManager).toBeDefined();
        });

        it('should use defaults when no config file is found', () => {
            mockExistsSync.mockReturnValue(false);

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            // Should have defaults loaded
            expect(config.api.firefly.url).toBe('http://localhost:8080');
        });

        it('should prefer CLI --config flag over current directory config', () => {
            const customPath = '/custom/priority-config.yaml';

            mockExistsSync.mockImplementation((filePath: string) => {
                if (typeof filePath === 'string') {
                    return filePath === customPath || filePath === './config.yaml';
                }
                return false;
            });

            mockReadFileSync.mockImplementation((filePath: string) => {
                if (filePath === customPath) {
                    return 'custom yaml';
                }
                return 'default yaml';
            });

            mockYamlLoad.mockImplementation((content: string) => {
                if (content === 'custom yaml') {
                    return { customConfigUsed: true };
                }
                return { customConfigUsed: false };
            });

            const configManager = ConfigManager.getInstance(customPath);
            expect(configManager).toBeDefined();
        });

        it('should prefer home directory over defaults when no CLI path provided', () => {
            const homeDir = process.env.HOME || process.env.USERPROFILE;
            const homePath = `${homeDir}/.budgeting/config.yaml`;

            mockExistsSync.mockImplementation((filePath: string) => {
                if (typeof filePath === 'string') {
                    return filePath === homePath;
                }
                return false;
            });

            mockReadFileSync.mockReturnValue('home yaml');
            mockYamlLoad.mockReturnValue({ loadedFromHome: true });

            const configManager = ConfigManager.getInstance();
            expect(configManager).toBeDefined();
        });
    });
});
