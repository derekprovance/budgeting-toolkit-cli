import { jest } from '@jest/globals';
import * as os from 'os';
import path from 'path';

const mockExistsSync = jest.fn<(filePath: string) => boolean>();
const mockReadFileSync = jest.fn<(filePath: string) => string>();
const mockAccessSync = jest.fn<() => void>();
const mockYamlLoad = jest.fn<(content: string) => any>();
const mockConfigSync = jest.fn<() => void>();

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

jest.unstable_mockModule('js-yaml', () => ({
    load: mockYamlLoad,
    default: {
        load: mockYamlLoad,
    },
}));

jest.unstable_mockModule('dotenv', () => ({
    config: mockConfigSync,
    default: {
        config: mockConfigSync,
    },
}));

// Import ConfigManager after mocks are set up
const { ConfigManager } = await import('../../src/config/config-manager.js');
const { ConfigValidationError } = await import('../../src/config/config.validator.js');

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
        ConfigManager.resetInstance();

        process.cwd = jest.fn(() => '/test/path');

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

        mockExistsSync.mockReset();
        mockReadFileSync.mockReset();
        mockAccessSync.mockReset();
        mockYamlLoad.mockReset();
        mockConfigSync.mockReset();

        mockConfigSync.mockReturnValue(undefined);
        mockExistsSync.mockReturnValue(false); // No YAML file by default
        mockAccessSync.mockReturnValue(undefined);
    });

    describe('FIREFLY_API_URL trailing slash normalization', () => {
        beforeEach(() => {
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

            mockExistsSync.mockImplementation((filePath: string) => {
                if (typeof filePath === 'string') {
                    return filePath === '/path/to/cert.pem' || filePath === '/path/to/ca.pem';
                }
                return false;
            });

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

            mockExistsSync.mockImplementation((filePath: string) => {
                if (typeof filePath === 'string') {
                    return filePath === '/test/path/certs/client.pem';
                }
                return false;
            });

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

            expect(config).toBeDefined();
            expect(config.api.firefly.url).toBe('http://localhost:8080');
        });

        it('should give YAML config priority over environment variables', () => {
            // FIREFLY_API_URL comes from env, not YAML
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

        it('should carry each problem and missing variable on the thrown error', () => {
            delete process.env.FIREFLY_API_URL;
            delete process.env.FIREFLY_API_TOKEN;

            const thrown = (() => {
                try {
                    ConfigManager.getInstance();
                } catch (error) {
                    return error;
                }
            })();

            expect(thrown).toBeInstanceOf(ConfigValidationError);
            expect(thrown).toMatchObject({
                problems: ['FIREFLY_API_URL is required', 'FIREFLY_API_TOKEN is required'],
                missingEnvVars: ['FIREFLY_API_URL', 'FIREFLY_API_TOKEN'],
            });
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

        describe('lookup order (getResolvedPaths)', () => {
            const cwdConfig = '/test/path/config.yaml';
            const cwdEnv = '/test/path/.env';
            const customConfig = '/custom/config.yaml';
            const explicitEnv = '/explicit/.env';
            let homeConfig: string;
            let homeEnv: string;

            const existing = (...paths: string[]) =>
                mockExistsSync.mockImplementation(filePath => paths.includes(filePath));

            beforeEach(() => {
                homeConfig = path.join(os.homedir(), '.budget', 'config.yaml');
                homeEnv = path.join(os.homedir(), '.budget', '.env');
                mockReadFileSync.mockReturnValue('yaml content');
                mockYamlLoad.mockReturnValue({});
            });

            it('should take --config over ./config.yaml and ~/.budget/config.yaml', () => {
                existing(customConfig, cwdConfig, homeConfig);

                ConfigManager.getInstance(customConfig);

                expect(ConfigManager.getResolvedPaths().configPath).toBe(customConfig);
            });

            it('should fall back to ./config.yaml over ~/.budget/config.yaml', () => {
                existing(cwdConfig, homeConfig);

                ConfigManager.getInstance();

                expect(ConfigManager.getResolvedPaths().configPath).toBe(cwdConfig);
            });

            it('should fall back to ~/.budget/config.yaml', () => {
                existing(homeConfig);

                ConfigManager.getInstance();

                expect(ConfigManager.getResolvedPaths().configPath).toBe(homeConfig);
            });

            it('should resolve no config file, and warn, when none exists', () => {
                const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
                existing();

                ConfigManager.getInstance();

                expect(ConfigManager.getResolvedPaths().configPath).toBeNull();
                expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No config.yaml'));
                warnSpy.mockRestore();
            });

            it('should take ENV_FILE over ./.env and ~/.budget/.env, even when it is missing', () => {
                process.env.ENV_FILE = explicitEnv;
                existing(customConfig, cwdEnv, homeEnv);

                ConfigManager.getInstance(customConfig);

                expect(ConfigManager.getResolvedPaths().envPath).toBe(explicitEnv);
            });

            it('should fall back to ./.env over ~/.budget/.env', () => {
                existing(customConfig, cwdEnv, homeEnv);

                ConfigManager.getInstance(customConfig);

                expect(ConfigManager.getResolvedPaths().envPath).toBe(cwdEnv);
            });

            it('should fall back to ~/.budget/.env', () => {
                existing(customConfig, homeEnv);

                ConfigManager.getInstance(customConfig);

                expect(ConfigManager.getResolvedPaths().envPath).toBe(homeEnv);
                expect(mockConfigSync).toHaveBeenCalledWith({ path: homeEnv, quiet: true });
            });

            it('should load no .env file when none exists', () => {
                existing(customConfig);

                ConfigManager.getInstance(customConfig);

                expect(ConfigManager.getResolvedPaths().envPath).toBeNull();
                expect(mockConfigSync).not.toHaveBeenCalled();
            });

            it('should resolve only the explicit files in strict mode, with every fallback present', () => {
                process.env.BTK_STRICT_CONFIG = '1';
                process.env.ENV_FILE = explicitEnv;
                existing(customConfig, explicitEnv, cwdConfig, homeConfig, cwdEnv, homeEnv);

                ConfigManager.getInstance(customConfig);

                expect(ConfigManager.getResolvedPaths()).toEqual({
                    configPath: customConfig,
                    envPath: explicitEnv,
                });
            });
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

            ConfigManager.getInstance(customPath);

            expect(ConfigManager.getResolvedPaths()).toEqual({
                configPath: customPath,
                envPath: envFile,
            });
            expect(mockConfigSync).toHaveBeenCalledTimes(1);
            expect(mockConfigSync).toHaveBeenCalledWith({ path: envFile, quiet: true });
        });

        it('resolves a relative ENV_FILE against the working directory', () => {
            process.env.ENV_FILE = 'rel/.env';
            mockExistsSync.mockImplementation(existing(customPath, '/test/path/rel/.env'));

            ConfigManager.getInstance(customPath);

            expect(ConfigManager.getResolvedPaths().envPath).toBe('/test/path/rel/.env');
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
