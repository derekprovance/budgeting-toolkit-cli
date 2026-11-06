import { Command, Option } from 'commander';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { FireflyClientWithCerts } from './api/firefly-client-with-certs.js';
import { ConfigManager } from './config/config-manager.js';
import { ConfigValidationError } from './config/config.validator.js';
import { CategorizeCommand } from './commands/categorize.command.js';
import { SplitTransactionCommand } from './commands/split-transaction.command.js';
import { AppServices, ServiceFactory } from './factories/service.factory.js';
import { createAnalyzeCommand, createBudgetReportCommand } from './factories/command.factory.js';
import {
    BudgetDateOptions,
    CategorizeOptions,
} from './types/interface/command-options.interface.js';
import { CategorizeMode } from './types/enums.js';
import { CommandConfigValidator, requireCommandConfig } from './utils/command-config-validator.js';
import { logger } from './logger.js';
import { errorMessage } from './utils/error-detection.utils.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

const getCurrentMonth = (): number => {
    return new Date().getMonth() + 1;
};

const getCurrentYear = (): number => {
    return new Date().getFullYear();
};

const validateMonth = (value: string): number => {
    const month = parseInt(value, 10);
    if (isNaN(month) || month < 1 || month > 12) {
        throw new Error(`Month must be between 1-12, got: ${value}`);
    }
    return month;
};

const validateYear = (value: string): number => {
    const year = parseInt(value, 10);
    const currentYear = getCurrentYear();
    if (isNaN(year) || year < 2000 || year > currentYear + 5) {
        throw new Error(`Year must be between 2000-${currentYear + 5}, got: ${value}`);
    }
    return year;
};

/**
 * Adds the shared month/year options to a command
 */
const withDateOptions = (command: Command): Command =>
    command
        .addOption(
            new Option('-m, --month <month>', 'target month (1-12)')
                .argParser(validateMonth)
                .default(getCurrentMonth(), 'current month')
        )
        .addOption(
            new Option('-y, --year <year>', 'target year')
                .argParser(validateYear)
                .default(getCurrentYear(), 'current year')
        );

/** Options shared by the report commands (`analyze`, `report`) */
type ReportCommandOptions = BudgetDateOptions & { json?: boolean };

/**
 * Adds the `--json` flag to a report command
 */
const withJsonOption = (command: Command): Command =>
    command.option(
        '--json',
        'print only a machine-readable JSON document to stdout (spinner and text report suppressed)'
    );

/**
 * Exits with usage guidance when a required positional argument is blank.
 * (Commander already rejects a missing argument; this catches whitespace.)
 */
const requireArg = (value: string, name: string, usage: string, example: string): void => {
    if (!value || value.trim() === '') {
        console.error(`❌ Error: ${name} is required and cannot be empty`);
        console.error(`\nUsage: ${usage}`);
        console.error(`Example: ${example}`);
        process.exit(1);
    }
};

const handleError = (error: unknown, operation: string): never => {
    logger.error({ err: error }, `Error ${operation}:`);
    // The structured log is silenced at LOG_LEVEL=silent; the user still needs
    // to see why the command failed.
    console.error(`Error ${operation}: ${errorMessage(error)}`);
    process.exit(1);
};

/**
 * Explains why configuration could not be loaded. Never re-enters
 * ConfigManager.getInstance: when the constructor threw, a second call would
 * throw the identical error. The resolved paths are captured statically before
 * validation runs.
 */
const printConfigFailure = (error: unknown): void => {
    if (error instanceof ConfigValidationError) {
        printValidationFailure(error);
        return;
    }
    console.error('Failed to initialize API client:', errorMessage(error));
    console.error(
        '\nCopy config.yaml.example and .env.example to ~/.budget/ or check your config.\n'
    );
};

const printValidationFailure = (error: ConfigValidationError): void => {
    const { configPath, envPath } = ConfigManager.getResolvedPaths();

    console.error('\n[!] Configuration validation failed\n');
    console.error('Loaded files:');
    console.error(`  config.yaml: ${configPath ?? '(none found)'}`);
    console.error(`  .env:        ${envPath ?? '(none found)'}`);

    // Every problem, not a bare "validation failed": that leaves no way to
    // tell which setting is wrong
    console.error('\nProblems found:');
    error.problems.forEach(problem => console.error(`  - ${problem}`));

    // Missing credentials come from .env rather than config.yaml, so point at
    // the right file when that is what is wrong
    if (error.missingEnvVars.length > 0) {
        console.error(`\nSet the missing environment variables in ${envPath || '.env'}:`);
        error.missingEnvVars.forEach(name => console.error(`  - ${name}`));
    }

    const isUsingCwdFiles = [configPath, envPath].some(file => file?.startsWith(process.cwd()));
    if (isUsingCwdFiles) {
        console.error('\nNote: Files in the current directory take priority over ~/.budget/');
        console.error('      You can:');
        console.error('      - Move/delete local config files to use ~/.budget/ instead');
        console.error('      - Or update values in the current directory files');
        console.error(
            '      - Or use --config flag to override: btk --config ~/.budget/config.yaml'
        );
    } else {
        console.error('\nCopy config.yaml.example and .env.example to ~/.budget/ to get started.');
    }

    console.error('\nSee example file: .env.example\n');
};

export const createCli = (configPath?: string): Command => {
    const program = new Command();

    program
        .name('budgeting-toolkit')
        .description(packageJson.description)
        .version(packageJson.version)
        .option('-v, --verbose', 'show detailed transaction breakdowns in reports')
        .option('-c, --config <path>', 'path to config.yaml file');

    // Try to initialize API client and services for other commands
    let apiClient: FireflyClientWithCerts;
    let services: AppServices;

    try {
        const configManager = ConfigManager.getInstance(configPath);
        const config = configManager.getConfig();

        // Apply the configured log level now that configuration is loaded
        // (the logger initializes from LOG_LEVEL/'info' at import time)
        logger.level = config.logging.level;

        // Create Firefly client with properly formatted config
        apiClient = new FireflyClientWithCerts({
            BASE: config.api.firefly.url + '/api',
            TOKEN: config.api.firefly.token,
            caCertPath: config.api.firefly.certificates?.caCertPath,
            clientCertPath: config.api.firefly.certificates?.clientCertPath,
            clientCertPassword: config.api.firefly.certificates?.clientCertPassword,
        });

        services = ServiceFactory.createServices(apiClient, config);
    } catch (error) {
        printConfigFailure(error);
        process.exit(1);
    }

    withJsonOption(
        withDateOptions(
            program
                .command('analyze')
                .alias('an')
                .description('Budget analysis with surplus/deficit variance')
        )
    )
        .addHelpText(
            'after',
            `
Examples:
  $ budgeting-toolkit analyze                   # current month
  $ budgeting-toolkit analyze -m 6              # June, current year
  $ budgeting-toolkit analyze -m 12 -y 2024     # December 2024
  $ budgeting-toolkit an -m 3                   # March (using alias)
  $ budgeting-toolkit analyze -m 6 --json       # machine-readable output`
        )
        .action(async (opts: ReportCommandOptions) => {
            try {
                const configManager = ConfigManager.getInstance(configPath);
                const config = configManager.getConfig();
                requireCommandConfig(config, 'analyze');

                const command = createAnalyzeCommand(services, config);
                await command.execute({
                    month: opts.month!,
                    year: opts.year!,
                    verbose: program?.opts().verbose || false,
                    format: opts.json ? 'json' : 'text',
                });
            } catch (error) {
                handleError(error, 'analyzing budget');
            }
        });

    withJsonOption(
        withDateOptions(
            program
                .command('report')
                .alias('st')
                .description('Display current budget report and spending analysis')
        )
    )
        .addHelpText(
            'after',
            `
Examples:
  $ budgeting-toolkit report                      # current month report
  $ budgeting-toolkit report -m 8                 # August report
  $ budgeting-toolkit st                          # current month (using alias)
  $ budgeting-toolkit report -m 8 --json          # machine-readable output`
        )
        .action(async (opts: ReportCommandOptions) => {
            try {
                const command = createBudgetReportCommand(services);
                await command.execute({
                    month: opts.month!,
                    year: opts.year!,
                    verbose: program?.opts().verbose || false,
                    format: opts.json ? 'json' : 'text',
                });
            } catch (error) {
                handleError(error, 'getting budget report');
            }
        });

    program
        .command('categorize <tag>')
        .alias('cat')
        .description('AI-powered transaction categorization and budget assignment')
        .addOption(
            new Option('-m, --mode <mode>', 'what to update')
                .choices(['category', 'budget', 'both'])
                .default('both', 'categories and budgets')
        )
        .option(
            '-f, --force',
            'force AI to re-run on transactions that already have both a category and budget assigned'
        )
        .option('-n, --dry-run', 'preview proposed changes without applying them')
        .addHelpText(
            'before',
            `
Note: Requires ANTHROPIC_API_KEY environment variable for AI categorization.`
        )
        .addHelpText(
            'after',
            `
Examples:
  $ budgeting-toolkit categorize Import-2025-06-23              # categorize new transactions
  $ budgeting-toolkit categorize Import-2025-06-23 -f           # categorize all transactions
  $ budgeting-toolkit categorize Import-2025-06-23 -n           # preview changes only
  $ budgeting-toolkit categorize Import-2025-06-23 -m category  # categories only`
        )
        .action(async (tag: string, opts: CategorizeOptions) => {
            requireArg(
                tag,
                'Tag parameter',
                'budgeting-toolkit categorize <tag> [options]',
                'budgeting-toolkit categorize Import-2025-06-23'
            );

            try {
                // Validate command-specific configuration (including ANTHROPIC_API_KEY)
                const config = ConfigManager.getInstance().getConfig();
                CommandConfigValidator.validateCategorizeCommand(config);

                const aiTransactionUpdateOrchestrator =
                    await ServiceFactory.createAITransactionUpdateOrchestrator(
                        services,
                        opts.force,
                        opts.dryRun
                    );

                const command = new CategorizeCommand(aiTransactionUpdateOrchestrator);
                await command.execute({
                    tag,
                    updateMode: opts.mode as CategorizeMode,
                    dryRun: opts.dryRun,
                });
            } catch (error) {
                handleError(error, 'categorizing transactions');
            }
        });

    program
        .command('split <transaction-id>')
        .alias('sp')
        .description('Split a transaction into two parts')
        .option('-a, --amount <amount>', 'amount for first split')
        .option('-d, --descriptions <text...>', 'custom text to append to split descriptions')
        .option('-y, --yes', 'skip confirmation prompt')
        .addHelpText(
            'after',
            `
Examples:
  $ budgeting-toolkit split 4361                                    # fully interactive
  $ budgeting-toolkit split 4361 -a 50.00                           # provide amount, prompt for rest
  $ budgeting-toolkit split 4361 -a 50.00 -d "- Groceries"          # first split with description
  $ budgeting-toolkit sp 4361 -a 50 -d "- Me" "- Family" -y         # both descriptions, skip confirmation
  $ budgeting-toolkit sp 4361 -a 50 -d "- Split 1" "" -y            # first only (empty string for second)

Behavior:
  - First split preserves category, budget, and tags from original
  - Second split left uncategorized for manual assignment in Firefly III
  - Descriptions are applied in order: first to split 1, second to split 2, etc.
  - Omit parameters to use interactive prompts`
        )
        .action(
            async (
                transactionId: string,
                opts: {
                    amount?: string;
                    descriptions?: string[];
                    yes?: boolean;
                }
            ) => {
                requireArg(
                    transactionId,
                    'Transaction ID',
                    'budgeting-toolkit split <transaction-id> [options]',
                    'budgeting-toolkit split 4361'
                );

                try {
                    const command = new SplitTransactionCommand(
                        services.transactionSplitService,
                        services.splitTransactionDisplayService,
                        services.userInputService
                    );

                    await command.execute({
                        transactionId,
                        amount: opts.amount,
                        descriptions: opts.descriptions,
                        yes: opts.yes,
                    });
                } catch (error) {
                    handleError(error, 'splitting transaction');
                }
            }
        );

    return program;
};
