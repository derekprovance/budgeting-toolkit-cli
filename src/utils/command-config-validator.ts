import { AppConfig } from '../config/config.types.js';

type ConfiguredCommand = 'analyze' | 'categorize';

interface CommandRequirement {
    isMet: (config: AppConfig) => boolean;
    guidance: string;
}

/** What each command needs beyond ConfigValidator's startup format checks. */
const COMMAND_REQUIREMENTS: Record<ConfiguredCommand, CommandRequirement> = {
    analyze: {
        isMet: config => config.transactions.expectedMonthlyPaycheck !== undefined,
        guidance:
            'expectedMonthlyPaycheck is required for analyze command.\n' +
            '  Add to config.yaml:\n' +
            '    expectedMonthlyPaycheck: 5000.00\n\n' +
            'See CONFIG.md for detailed configuration documentation.',
    },
    categorize: {
        isMet: config => Boolean(config.api.claude.apiKey),
        guidance:
            'ANTHROPIC_API_KEY is required for categorize command.\n' +
            '  Add to .env file:\n' +
            '    ANTHROPIC_API_KEY=your_anthropic_key_here\n\n' +
            '  Get your API key from: https://console.anthropic.com/\n\n' +
            'See CONFIG.md for detailed AI configuration.',
    },
};

/**
 * @throws Error carrying the guidance text when `command` cannot run with `config`
 */
export function requireCommandConfig(config: AppConfig, command: ConfiguredCommand): void {
    const requirement = COMMAND_REQUIREMENTS[command];
    if (!requirement.isMet(config)) {
        throw new Error(requirement.guidance);
    }
}

export const CommandConfigValidator = {
    validateCategorizeCommand: (config: AppConfig): void =>
        requireCommandConfig(config, 'categorize'),
};
