import * as path from 'path';
import { jest } from '@jest/globals';

// Create mock functions
const mockExistsSync = jest.fn<() => boolean>();
const mockReadFileSync = jest.fn<() => string>();
const mockYamlLoad = jest.fn<() => any>();

// Use unstable_mockModule for ESM mocking
jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
}));

jest.unstable_mockModule('js-yaml', () => ({
    load: mockYamlLoad,
}));

// Dynamic import after mocks are set up
const { ConfigLoader } = await import('../../src/utils/config-loader.js');

describe('ConfigLoader', () => {
    let configLoader: ConfigLoader;
    let originalProcessCwd: () => string;

    beforeAll(() => {
        originalProcessCwd = process.cwd;
    });

    afterAll(() => {
        process.cwd = originalProcessCwd;
    });

    beforeEach(() => {
        // Mock process.cwd to return a consistent path
        process.cwd = jest.fn().mockReturnValue('/test/path');

        // Create ConfigLoader
        configLoader = new ConfigLoader();

        // Clear environment variables
        delete process.env.TEST_ENV_VAR;

        // Clear cache
        configLoader.clearCache();

        // Reset mocks (use mockReset to preserve the mock function)
        mockExistsSync.mockReset();
        mockReadFileSync.mockReset();
        mockYamlLoad.mockReset();
    });

    describe('loadYamlConfig', () => {
        it('should load config from file when not cached', () => {
            const mockConfig = { expectedMonthlyPaycheck: 5000 };
            const expectedPath = path.join('/test/path', 'budgeting-toolkit.config.yaml');

            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('expectedMonthlyPaycheck: 5000');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            const result = configLoader.loadYamlConfig();

            expect(mockExistsSync).toHaveBeenCalledWith(expectedPath);
            expect(mockReadFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');
            expect(mockYamlLoad).toHaveBeenCalledWith('expectedMonthlyPaycheck: 5000');
            expect(result).toEqual(mockConfig);
        });

        it('should throw error if config file does not exist', () => {
            (mockExistsSync as jest.Mock).mockReturnValue(false);

            expect(() => configLoader.loadYamlConfig()).toThrow(
                'Failed to load YAML configuration'
            );
        });

        it('should throw error if YAML loading fails', () => {
            const error = new Error('YAML parse error');

            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('invalid: yaml: content');
            (mockYamlLoad as jest.Mock).mockImplementation(() => {
                throw error;
            });

            expect(() => configLoader.loadYamlConfig()).toThrow(
                'Failed to load YAML configuration'
            );
        });

        it('should return empty object if mockYamlLoad returns null', () => {
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('');
            (mockYamlLoad as jest.Mock).mockReturnValue(null);

            const result = configLoader.loadYamlConfig();

            expect(result).toEqual({});
        });

        it('should return empty object if mockYamlLoad returns undefined', () => {
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('');
            (mockYamlLoad as jest.Mock).mockReturnValue(undefined as any);

            const result = configLoader.loadYamlConfig();

            expect(result).toEqual({});
        });
    });

    describe('getConfigValue', () => {
        it('should return YAML value when available', () => {
            const mockConfig = { expectedMonthlyPaycheck: 5000 };
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('expectedMonthlyPaycheck: 5000');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            const result = configLoader.getConfigValue(
                'expectedMonthlyPaycheck',
                'TEST_ENV_VAR',
                3000
            );

            expect(result).toBe(5000);
        });

        it('should return environment variable when YAML value not available', () => {
            const mockConfig = {};
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('{}');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = '4000';

            const result = configLoader.getConfigValue(
                'expectedMonthlyPaycheck',
                'TEST_ENV_VAR',
                3000
            );

            expect(result).toBe(4000); // Should be parsed as number
        });

        it('should parse environment variable as number when default is number', () => {
            const mockConfig = {};
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('{}');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = '4000';

            const result = configLoader.getConfigValue(
                'expectedMonthlyPaycheck',
                'TEST_ENV_VAR',
                3000
            );

            expect(result).toBe(4000);
            expect(typeof result).toBe('number');
        });

        it('should return string environment variable when number parsing fails', () => {
            const mockConfig = {};
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('{}');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = 'not-a-number';

            const result = configLoader.getConfigValue(
                'expectedMonthlyPaycheck',
                'TEST_ENV_VAR',
                3000
            );

            expect(result).toBe('not-a-number');
        });

        it('should return default value when neither YAML nor env var available', () => {
            const mockConfig = {};
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('{}');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            const result = configLoader.getConfigValue(
                'expectedMonthlyPaycheck',
                'TEST_ENV_VAR',
                3000
            );

            expect(result).toBe(3000);
        });

        it('should return undefined when no default provided and no values available', () => {
            const mockConfig = {};
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('{}');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            const result = configLoader.getConfigValue('expectedMonthlyPaycheck', 'TEST_ENV_VAR');

            expect(result).toBeUndefined();
        });

        it('should return YAML value over environment variable when both exist', () => {
            const mockConfig = { expectedMonthlyPaycheck: 5000 };
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('expectedMonthlyPaycheck: 5000');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = '4000';

            const result = configLoader.getConfigValue(
                'expectedMonthlyPaycheck',
                'TEST_ENV_VAR',
                3000
            );

            expect(result).toBe(5000);
        });

        it('should handle undefined YAML value correctly', () => {
            const mockConfig = { expectedMonthlyPaycheck: undefined };
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('{}');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = '4000';

            const result = configLoader.getConfigValue(
                'expectedMonthlyPaycheck',
                'TEST_ENV_VAR',
                3000
            );

            expect(result).toBe(4000);
        });

        it('should work without environment key provided', () => {
            const mockConfig = { expectedMonthlyPaycheck: 5000 };
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('expectedMonthlyPaycheck: 5000');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            const result = configLoader.getConfigValue('expectedMonthlyPaycheck', undefined, 3000);

            expect(result).toBe(5000);
        });

        it('should return default when no env key and no YAML value', () => {
            const mockConfig = {};
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('{}');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            const result = configLoader.getConfigValue('expectedMonthlyPaycheck', undefined, 3000);

            expect(result).toBe(3000);
        });

        it('should handle complex nested YAML config', () => {
            const mockConfig = {
                llm: {
                    maxTokens: 1000,
                    temperature: 0.7,
                },
            };
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue(
                'llm:\n  maxTokens: 1000\n  temperature: 0.7'
            );
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            const result = configLoader.getConfigValue('llm', 'LLM_CONFIG');

            expect(result).toEqual({
                maxTokens: 1000,
                temperature: 0.7,
            });
        });

        it('should handle empty env var correctly', () => {
            const mockConfig = {};
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue('{}');
            (mockYamlLoad as jest.Mock).mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = '';

            const result = configLoader.getConfigValue(
                'expectedMonthlyPaycheck',
                'TEST_ENV_VAR',
                3000
            );

            expect(result).toBe(''); // Empty string is returned as-is
        });
    });
});
