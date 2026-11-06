import { describe, expect, it } from '@jest/globals';
import { requireCommandConfig } from '../../src/utils/command-config-validator.js';
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

/** The message requireCommandConfig threw, or '' when it did not throw */
const failureFor = (config: AppConfig, command: 'analyze' | 'categorize'): string => {
    try {
        requireCommandConfig(config, command);
        return '';
    } catch (error) {
        return (error as Error).message;
    }
};

describe('requireCommandConfig', () => {
    describe('analyze', () => {
        it('should accept a config with expectedMonthlyPaycheck', () => {
            expect(failureFor(buildConfig(), 'analyze')).toBe('');
        });

        it('should not require untrackedAccounts', () => {
            // Empty means every active asset account is in the envelope
            const config = buildConfig();
            expect(config.accounts.untrackedAccounts).toEqual([]);

            expect(failureFor(config, 'analyze')).toBe('');
        });

        it('should throw guidance naming the setting, the file and the docs when expectedMonthlyPaycheck is missing', () => {
            const message = failureFor(
                buildConfig({ expectedMonthlyPaycheck: undefined }),
                'analyze'
            );

            expect(message).toContain('expectedMonthlyPaycheck is required for analyze command');
            expect(message).toContain('Add to config.yaml:\n    expectedMonthlyPaycheck: 5000.00');
            expect(message).toContain('See CONFIG.md');
        });
    });

    describe('categorize', () => {
        it('should accept a config with ANTHROPIC_API_KEY', () => {
            expect(failureFor(buildConfig({ claudeApiKey: 'sk-test' }), 'categorize')).toBe('');
        });

        it('should throw guidance with where to get a key when ANTHROPIC_API_KEY is missing', () => {
            const message = failureFor(buildConfig({ claudeApiKey: '' }), 'categorize');

            expect(message).toContain('ANTHROPIC_API_KEY is required for categorize command');
            expect(message).toContain('https://console.anthropic.com');
            expect(message).toContain('See CONFIG.md');
        });
    });
});
