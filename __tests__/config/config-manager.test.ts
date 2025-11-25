import { jest } from '@jest/globals';

// Create mock functions
const mockExistsSync = jest.fn<() => boolean>();
const mockReadFileSync = jest.fn<() => string>();
const mockYamlLoad = jest.fn<() => any>();
const mockConfigSync = jest.fn<() => void>();

// Mock fs module
jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    default: {
        existsSync: mockExistsSync,
        readFileSync: mockReadFileSync,
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
        mockYamlLoad.mockReset();
        mockConfigSync.mockReset();

        // Default mock implementations
        mockConfigSync.mockReturnValue(undefined);
        mockExistsSync.mockReturnValue(false); // No YAML file by default
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

        it('should throw error when ANTHROPIC_API_KEY is missing', () => {
            process.env.FIREFLY_API_URL = 'http://localhost:8080';
            process.env.FIREFLY_API_TOKEN = 'test-token';
            delete process.env.ANTHROPIC_API_KEY;

            expect(() => ConfigManager.getInstance()).toThrow(/Configuration validation failed/);
        });
    });
});
