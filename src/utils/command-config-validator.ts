import chalk from 'chalk';
import { AppConfig } from '../config/config.types.js';

/**
 * Command-specific configuration validation.
 *
 * Validates that required configuration for each command is present and usable.
 * ConfigValidator handles format validation; this handles business requirements.
 */
export class CommandConfigValidator {
    /**
     * Validates configuration for finalize command
     */
    static validateFinalizeCommand(config: AppConfig): void {
        const errors: string[] = [];

        if (config.transactions.expectedMonthlyPaycheck === undefined) {
            errors.push(
                'expectedMonthlyPaycheck is required for finalize command.\n' +
                    '  Add to budgeting-toolkit.config.yaml:\n' +
                    '    expectedMonthlyPaycheck: 5000.00'
            );
        }

        if (config.accounts.validDestinationAccounts.length === 0) {
            errors.push(
                'validDestinationAccounts is required for finalize command.\n' +
                    '  Add to budgeting-toolkit.config.yaml:\n' +
                    '    validDestinationAccounts:\n' +
                    "      - '1'  # Your checking account ID from Firefly III"
            );
        }

        if (config.accounts.validExpenseAccounts.length === 0) {
            errors.push(
                'validExpenseAccounts is required for finalize command.\n' +
                    '  Add to budgeting-toolkit.config.yaml:\n' +
                    '    validExpenseAccounts:\n' +
                    "      - '3'  # Your expense account ID from Firefly III"
            );
        }

        if (errors.length > 0) {
            console.error(chalk.red.bold('\n❌ Configuration Error: finalize command\n'));
            errors.forEach(error => console.error(chalk.red(error) + '\n'));
            console.error(chalk.yellow('See CONFIG.md for detailed configuration documentation.'));
            process.exit(1);
        }
    }

    /**
     * Validates configuration for categorize command
     */
    static validateCategorizeCommand(config: AppConfig): void {
        const errors: string[] = [];

        if (!config.api.claude.apiKey) {
            errors.push(
                'ANTHROPIC_API_KEY is required for categorize command.\n' +
                    '  Add to .env file:\n' +
                    '    ANTHROPIC_API_KEY=your_anthropic_key_here\n\n' +
                    '  Get your API key from: https://console.anthropic.com/'
            );
        }

        if (errors.length > 0) {
            console.error(chalk.red.bold('\n❌ Configuration Error: categorize command\n'));
            errors.forEach(error => console.error(chalk.red(error) + '\n'));
            console.error(chalk.yellow('See CONFIG.md for detailed AI configuration.'));
            process.exit(1);
        }
    }

    /**
     * Validates configuration for split command
     *
     * Split command has no special configuration requirements beyond basic Firefly API access,
     * which is validated by ConfigValidator at startup.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static validateSplitCommand(_config: AppConfig): void {
        // No-op: split command requires no additional validation
    }
}
