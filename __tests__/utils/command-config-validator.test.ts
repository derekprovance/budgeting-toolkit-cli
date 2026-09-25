import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CommandConfigValidator } from '../../src/utils/command-config-validator.js';
import { AppConfig } from '../../src/config/config.types.js';
import { DEFAULT_CONFIG } from '../../src/config/config.defaults.js';

/**
 * A complete, typed config. The account override lists stay empty, as the
 * documented setup has them: income destinations and expense sources are
 * derived from Firefly's account roles.
 */
const buildConfig = (
    overrides: {
        expectedMonthlyPaycheck?: number;
        claudeApiKey?: string;
    } = {}
): AppConfig => {
    const config = structuredClone(DEFAULT_CONFIG);
    config.api.firefly.url = 'http://localhost';
    config.api.firefly.token = 'token';
    config.api.claude.apiKey = overrides.claudeApiKey ?? '';
    config.transactions.expectedMonthlyPaycheck =
        'expectedMonthlyPaycheck' in overrides ? overrides.expectedMonthlyPaycheck : 5000;
    return config;
};

describe('CommandConfigValidator', () => {
    let mockConsoleError: jest.SpiedFunction<typeof console.error>;
    let mockConsoleWarn: jest.SpiedFunction<typeof console.warn>;
    let mockProcessExit: jest.SpiedFunction<typeof process.exit>;

    beforeEach(() => {
        // Mock console methods
        mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Mock process.exit
        mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(code => {
            throw new Error(`process.exit(${code})`);
        });
    });

    afterEach(() => {
        mockConsoleError.mockRestore();
        mockConsoleWarn.mockRestore();
        mockProcessExit.mockRestore();
    });

    const errorOutput = () => mockConsoleError.mock.calls.map(call => call.join(' ')).join('\n');

    describe('validateAnalyzeCommand', () => {
        it('should not throw when all required config is present', () => {
            const config = buildConfig();

            expect(() => CommandConfigValidator.validateAnalyzeCommand(config)).not.toThrow();
            expect(mockConsoleError).not.toHaveBeenCalled();
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should exit when expectedMonthlyPaycheck is missing', () => {
            const config = buildConfig({ expectedMonthlyPaycheck: undefined });

            expect(() => CommandConfigValidator.validateAnalyzeCommand(config)).toThrow(
                'process.exit(1)'
            );
            expect(mockConsoleError).toHaveBeenCalled();
            expect(errorOutput()).toContain('expectedMonthlyPaycheck is required');
            expect(errorOutput()).toContain('config.yaml');
        });

        it('should not require untrackedAccounts', () => {
            // Empty means every active asset account is in the envelope
            const config = buildConfig();
            expect(config.accounts.untrackedAccounts).toEqual([]);

            expect(() => CommandConfigValidator.validateAnalyzeCommand(config)).not.toThrow();
        });

        it('should report multiple validation errors at once', () => {
            const config = buildConfig({ expectedMonthlyPaycheck: undefined });

            expect(() => CommandConfigValidator.validateAnalyzeCommand(config)).toThrow(
                'process.exit(1)'
            );
            expect(errorOutput()).toContain('expectedMonthlyPaycheck is required');
            expect(errorOutput()).toContain('CONFIG.md');
        });
    });

    describe('validateCategorizeCommand', () => {
        it('should not throw when ANTHROPIC_API_KEY is present', () => {
            const config = buildConfig({ claudeApiKey: 'sk-test' });

            expect(() => CommandConfigValidator.validateCategorizeCommand(config)).not.toThrow();
            expect(mockConsoleError).not.toHaveBeenCalled();
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should exit when ANTHROPIC_API_KEY is missing', () => {
            const config = buildConfig({ claudeApiKey: '' });

            expect(() => CommandConfigValidator.validateCategorizeCommand(config)).toThrow(
                'process.exit(1)'
            );
            expect(mockConsoleError).toHaveBeenCalled();
            expect(errorOutput()).toContain('ANTHROPIC_API_KEY is required');
            expect(errorOutput()).toContain('https://console.anthropic.com');
            expect(errorOutput()).toContain('CONFIG.md');
        });
    });
});
