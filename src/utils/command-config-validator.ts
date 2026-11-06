import { AppConfig } from '../config/config.types.js';

type ConfiguredCommand = 'analyze' | 'categorize';

interface CommandRequirement {
    isMet: (config: AppConfig) => boolean;
    guidance: string;
    docsHint: string;
}

/** What each command needs beyond ConfigValidator's startup format checks. */
const COMMAND_REQUIREMENTS: Record<ConfiguredCommand, CommandRequirement> = {
    analyze: {
        isMet: config => config.transactions.expectedMonthlyPaycheck !== undefined,
        guidance:
            'expectedMonthlyPaycheck is required for analyze command.\n' +
            '  Add to config.yaml:\n' +
            '    expectedMonthlyPaycheck: 5000.00',
        docsHint: 'See CONFIG.md for detailed configuration documentation.',
    },
    categorize: {
        isMet: config => Boolean(config.api.claude.apiKey),
        guidance:
            'ANTHROPIC_API_KEY is required for categorize command.\n' +
            '  Add to .env file:\n' +
            '    ANTHROPIC_API_KEY=your_anthropic_key_here\n\n' +
            '  Get your API key from: https://console.anthropic.com/',
        docsHint: 'See CONFIG.md for detailed AI configuration.',
    },
};

/** A command cannot run with the loaded configuration; the CLI prints it as guidance. */
export class CommandConfigError extends Error {
    constructor(
        readonly command: ConfiguredCommand,
        readonly guidance: string,
        readonly docsHint: string
    ) {
        super(`${guidance}\n\n${docsHint}`);
        this.name = 'CommandConfigError';
    }
}

/**
 * @throws CommandConfigError carrying the guidance when `command` cannot run with `config`
 */
export function requireCommandConfig(config: AppConfig, command: ConfiguredCommand): void {
    const { isMet, guidance, docsHint } = COMMAND_REQUIREMENTS[command];
    if (!isMet(config)) {
        throw new CommandConfigError(command, guidance, docsHint);
    }
}
