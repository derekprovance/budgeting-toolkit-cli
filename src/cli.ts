import { Command, Option } from 'commander';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { FireflyClientWithCerts } from './api/firefly-client-with-certs.js';
import { ConfigManager } from './config/config-manager.js';
import { CategorizeCommand } from './commands/categorize.command.js';
import { SplitTransactionCommand } from './commands/split-transaction.command.js';
import { AppServices, ServiceFactory } from './factories/service.factory.js';
import { createAnalyzeCommand, createBudgetReportCommand } from './factories/command.factory.js';
import {
    BudgetDateOptions,
    CategorizeCliOptions,
} from './types/interface/command-options.interface.js';
import { CategorizeOptions } from './types/categorize.types.js';
import { CategorizeMode } from './types/enums.js';
import { CommandConfigValidator } from './utils/command-config-validator.js';
import { logger } from './logger.js';
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
    console.error(`Error ${operation}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
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
        const isValidationError =
            error instanceof Error && error.message.includes('Configuration validation failed');
        // Never re-enter getInstance here: when the constructor threw, a second
        // call would throw the identical error and skip this friendly output.
        // The resolved paths are captured statically before validation runs.
        const { configPath: loadedConfigPath, envPath: loadedEnvPath } =
            ConfigManager.getResolvedPaths();

        if (isValidationError) {
            // Show detailed validation error with file paths
            console.error('\n[!] Configuration validation failed\n');

            console.error('Loaded files:');
            console.error(`  config.yaml: ${loadedConfigPath ? loadedConfigPath : '(none found)'}`);
            console.error(`  .env:        ${loadedEnvPath ? loadedEnvPath : '(none found)'}`);

            // ConfigManager formats the message as a bulleted list, one entry
            // per validation error. Print all of them — a bare "validation
            // failed" leaves no way to tell which setting is wrong.
            const errorMsg = error instanceof Error ? error.message : String(error);
            const problems = errorMsg
                .split('\n')
                .map((line: string) => line.trim())
                .filter((line: string) => line.startsWith('- '))
                .map((line: string) => line.slice(2));

            if (problems.length > 0) {
                console.error('\nProblems found:');
                problems.forEach((problem: string) => console.error(`  - ${problem}`));
            }

            // Missing credentials come from .env rather than config.yaml, so
            // point at the right file when that is what is wrong
            const missingVars = problems
                .map((problem: string) => problem.match(/^([A-Z][A-Z0-9_]*) is required$/))
                .filter((match): match is RegExpMatchArray => match !== null)
                .map((match: RegExpMatchArray) => match[1]);

            if (missingVars.length > 0) {
                console.error(
                    `\nSet the missing environment variables in ${loadedEnvPath || '.env'}:`
                );
                missingVars.forEach((varName: string) => {
                    console.error(`  - ${varName}`);
                });
            }

            // Check if current directory files are being used
            const usingCwdFiles =
                (loadedConfigPath && loadedConfigPath.startsWith(process.cwd())) ||
                (loadedEnvPath && loadedEnvPath.startsWith(process.cwd()));

            if (usingCwdFiles) {
                console.error(
                    '\nNote: Files in the current directory take priority over ~/.budget/'
                );
                console.error('      You can:');
                console.error('      - Move/delete local config files to use ~/.budget/ instead');
                console.error('      - Or update values in the current directory files');
                console.error(
                    '      - Or use --config flag to override: btk --config ~/.budget/config.yaml'
                );
            } else {
                console.error(
                    '\nCopy config.yaml.example and .env.example to ~/.budget/ to get started.'
                );
            }

            console.error('\nSee example file: .env.example\n');
        } else {
            console.error(
                'Failed to initialize API client:',
                error instanceof Error ? error.message : String(error)
            );
            console.error(
                '\nCopy config.yaml.example and .env.example to ~/.budget/ or check your config.\n'
            );
        }

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
                CommandConfigValidator.validateAnalyzeCommand(config);

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
                .choices(Object.values(CategorizeMode))
                .default(CategorizeMode.Both, 'categories and budgets')
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
        .action(async (tag: string, opts: CategorizeCliOptions) => {
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

                const options: CategorizeOptions = {
                    force: opts.force ?? false,
                    dryRun: opts.dryRun ?? false,
                };
                const aiTransactionUpdateOrchestrator =
                    await ServiceFactory.createAITransactionUpdateOrchestrator(
                        services,
                        config,
                        options
                    );

                const command = new CategorizeCommand(aiTransactionUpdateOrchestrator);
                await command.execute({
                    tag,
                    updateMode: opts.mode,
                    dryRun: options.dryRun,
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
