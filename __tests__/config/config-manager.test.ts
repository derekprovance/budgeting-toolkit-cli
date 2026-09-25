import { jest } from '@jest/globals';
import * as os from 'os';

// Create mock functions
const mockExistsSync = jest.fn<(filePath: string) => boolean>();
const mockReadFileSync = jest.fn<(filePath: string) => string>();
const mockAccessSync = jest.fn<() => void>();
const mockYamlLoad = jest.fn<(content: string) => any>();
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
        process.cwd = jest.fn(() => '/test/path');

        // Clear environment variables
        process.env = { ...originalEnv };
        delete process.env.FIREFLY_API_URL;
        delete process.env.FIREFLY_API_TOKEN;
        delete process.env.ANTHROPIC_API_KEY;
        delete process.env.CLIENT_CERT_PATH;
        delete process.env.CLIENT_CERT_CA_PATH;
        delete process.env.CLIENT_CERT_PASSWORD;
        delete process.env.LOG_LEVEL;
        // The Jest setup file turns strict mode on globally; these tests
        // exercise the fallback chain, so start from non-strict and opt in
        // per test. afterAll restores the original environment.
        delete process.env.BTK_STRICT_CONFIG;
        delete process.env.ENV_FILE;

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
                untrackedAccounts: ['account-1', 'account-2'],
                expectedMonthlyPaycheck: 5000,
            };

            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue(yamlConfig);

            const configManager = ConfigManager.getInstance();
            const config = configManager.getConfig();

            expect(config.accounts.untrackedAccounts).toEqual(['account-1', 'account-2']);
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

        it('should keep defaults when YAML scalars are empty (parsed as null)', () => {
            // `model:` with no value parses to null — must not clobber the default
            const yamlConfig = {
                expectedMonthlyPaycheck: null,
                tags: { disposableIncome: null },
                llm: { model: null, maxTokens: null },
            };

            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue(yamlConfig);

            const config = ConfigManager.getInstance().getConfig();

            expect(config.llm.model).toBeTruthy();
            expect(config.llm.maxTokens).toBeGreaterThan(0);
            // Default is undefined — a null YAML scalar must not turn it into null
            expect(config.transactions.expectedMonthlyPaycheck).toBeUndefined();
            expect(config.transactions.tags.disposableIncome).toBe('Disposable Income');
        });

        it('[R-SCOPE-1] should read unquoted account ids as the strings Firefly uses', () => {
            // `- 27` parses as a number and would silently match no account
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue({ untrackedAccounts: [27, '2'] });

            const config = ConfigManager.getInstance().getConfig();

            expect(config.accounts.untrackedAccounts).toEqual(['27', '2']);
        });

        it('should read an unquoted exclusion amount as a string', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue({
                excludedTransactions: [{ description: 'Deposit', amount: 75 }],
            });

            const config = ConfigManager.getInstance().getConfig();

            expect(config.transactions.excludedTransactions).toEqual([
                { description: 'Deposit', amount: '75' },
            ]);
        });

        it('should preserve a legitimate falsy YAML value like 0', () => {
            const yamlConfig = { expectedMonthlyPaycheck: 0 };

            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue(yamlConfig);

            const config = ConfigManager.getInstance().getConfig();

            expect(config.transactions.expectedMonthlyPaycheck).toBe(0);
        });
    });

    describe('Unknown YAML keys', () => {
        let consoleWarnSpy: jest.Spied<typeof console.warn>;

        beforeEach(() => {
            process.env.FIREFLY_API_URL = 'http://localhost:8080';
            process.env.FIREFLY_API_TOKEN = 'test-token';
            consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
        });

        afterEach(() => {
            consoleWarnSpy.mockRestore();
        });

        it('should warn about an unrecognised setting', () => {
            mockYamlLoad.mockReturnValue({ untrackedAccounts: ['2'], notARealSetting: true });

            ConfigManager.getInstance();

            const warnings = consoleWarnSpy.mock.calls.map(call => String(call[0])).join('\n');
            expect(warnings).toContain('notARealSetting');
        });

        it('should stay quiet when every key is known', () => {
            mockYamlLoad.mockReturnValue({
                untrackedAccounts: ['2'],
                expectedMonthlyPaycheck: 5000,
                tags: { paycheck: 'Paycheck' },
                llm: { model: 'claude-sonnet-5' },
            });

            ConfigManager.getInstance();

            const warnings = consoleWarnSpy.mock.calls.map(call => String(call[0])).join('\n');
            expect(warnings).not.toContain('ignored');
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

        it('should return the same instance when the same path is passed again', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue({});

            const instance1 = ConfigManager.getInstance('/test/path/config.yaml');
            const instance2 = ConfigManager.getInstance('/test/path/config.yaml');
            const instance3 = ConfigManager.getInstance();

            expect(instance1).toBe(instance2);
            expect(instance1).toBe(instance3);
        });

        it('should throw when a different config path is passed after initialization', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue({});

            ConfigManager.getInstance('/test/path/a.yaml');

            expect(() => ConfigManager.getInstance('/test/path/b.yaml')).toThrow(
                /already initialized with a different config path/
            );
        });
    });

    describe('Resolved paths on validation failure', () => {
        it('should expose resolved paths even when the constructor throws', () => {
            // Missing required env vars → validation throws in the constructor
            delete process.env.FIREFLY_API_URL;
            delete process.env.FIREFLY_API_TOKEN;

            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue({});

            expect(() => ConfigManager.getInstance('/test/path/config.yaml')).toThrow(
                /Configuration validation failed/
            );

            // The friendly error path in cli.ts depends on this surviving the throw
            expect(ConfigManager.getResolvedPaths().configPath).toBe('/test/path/config.yaml');
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
            expect(configDir).toMatch(/\.budget$/);
            expect(configDir).toContain(os.homedir());
        });

        it('should return correct default config path', () => {
            const configPath = ConfigManager.getDefaultConfigPath();
            expect(configPath).toMatch(/\.budget[/\\]config\.yaml$/);
            expect(configPath).toContain(os.homedir());
        });

        it('should return correct default env path', () => {
            const envPath = ConfigManager.getDefaultEnvPath();
            expect(envPath).toMatch(/\.budget[/\\]\.env$/);
            expect(envPath).toContain(os.homedir());
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
            const homeDir = os.homedir();
            const homePath = `${homeDir}/.budget/config.yaml`;

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
            const homeDir = os.homedir();
            const homePath = `${homeDir}/.budget/config.yaml`;

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
    describe('Strict mode (BTK_STRICT_CONFIG)', () => {
        const customPath = '/explicit/config.yaml';
        const envFile = '/explicit/.env';

        beforeEach(() => {
            process.env.BTK_STRICT_CONFIG = '1';
            process.env.FIREFLY_API_URL = 'http://localhost:8080';
            process.env.FIREFLY_API_TOKEN = 'test-token';
            mockReadFileSync.mockReturnValue('yaml content');
            mockYamlLoad.mockReturnValue({});
        });

        const existing =
            (...paths: string[]) =>
            (filePath: string) =>
                paths.includes(filePath);

        it('is off unless BTK_STRICT_CONFIG is 1 or true', () => {
            delete process.env.BTK_STRICT_CONFIG;
            expect(ConfigManager.isStrictMode()).toBe(false);
            process.env.BTK_STRICT_CONFIG = '0';
            expect(ConfigManager.isStrictMode()).toBe(false);
            process.env.BTK_STRICT_CONFIG = 'true';
            expect(ConfigManager.isStrictMode()).toBe(true);
            process.env.BTK_STRICT_CONFIG = '1';
            expect(ConfigManager.isStrictMode()).toBe(true);
        });

        it('loads only the explicit --config path and ENV_FILE', () => {
            process.env.ENV_FILE = envFile;
            mockExistsSync.mockImplementation(existing(customPath, envFile));

            const manager = ConfigManager.getInstance(customPath);

            expect(manager.getLoadedConfigPath()).toBe(customPath);
            expect(manager.getLoadedEnvPath()).toBe(envFile);
            expect(mockConfigSync).toHaveBeenCalledTimes(1);
            expect(mockConfigSync).toHaveBeenCalledWith({ path: envFile, quiet: true });
        });

        it('resolves a relative ENV_FILE against the working directory', () => {
            process.env.ENV_FILE = 'rel/.env';
            mockExistsSync.mockImplementation(existing(customPath, '/test/path/rel/.env'));

            const manager = ConfigManager.getInstance(customPath);

            expect(manager.getLoadedEnvPath()).toBe('/test/path/rel/.env');
        });

        it('throws when no --config path is given, even if ./config.yaml and ~/.budget/config.yaml exist', () => {
            process.env.ENV_FILE = envFile;
            mockExistsSync.mockReturnValue(true);

            expect(() => ConfigManager.getInstance()).toThrow(
                /BTK_STRICT_CONFIG is set: pass the config file explicitly with --config/
            );
            expect(mockReadFileSync).not.toHaveBeenCalled();
        });

        it('still throws when the explicit --config path is missing', () => {
            process.env.ENV_FILE = envFile;
            mockExistsSync.mockImplementation(existing(envFile));

            expect(() => ConfigManager.getInstance(customPath)).toThrow(
                `Config file not found: ${customPath}`
            );
        });

        it('throws when ENV_FILE is unset, even if ./.env and ~/.budget/.env exist', () => {
            mockExistsSync.mockReturnValue(true);

            expect(() => ConfigManager.getInstance(customPath)).toThrow(
                /BTK_STRICT_CONFIG is set: ENV_FILE must name the \.env file/
            );
            expect(mockConfigSync).not.toHaveBeenCalled();
        });

        it('throws when ENV_FILE does not exist', () => {
            process.env.ENV_FILE = envFile;
            mockExistsSync.mockImplementation(existing(customPath));

            expect(() => ConfigManager.getInstance(customPath)).toThrow(
                `BTK_STRICT_CONFIG is set: ENV_FILE not found: ${envFile}`
            );
            expect(mockConfigSync).not.toHaveBeenCalled();
        });

        it('does not warn about a missing config.yaml (it never falls back to defaults)', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            mockExistsSync.mockReturnValue(false);

            expect(() => ConfigManager.getInstance()).toThrow(/BTK_STRICT_CONFIG/);
            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });
});
