import { Command, Option } from 'commander';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { FireflyClientWithCerts } from './api/firefly-client-with-certs.js';
import { ConfigManager } from './config/config-manager.js';
import { ConfigValidationError } from './config/config.validator.js';
import { CategorizeCommand } from './commands/categorize.command.js';
import { SplitTransactionCommand } from './commands/split-transaction.command.js';
import { AppServices, ServiceFactory } from './factories/service.factory.js';
import { createAnalyzeCommand, createBudgetReportCommand } from './factories/command.factory.js';
import { CategorizeCliOptions } from './types/interface/command-options.interface.js';
import { CategorizeOptions } from './types/categorize.types.js';
import { BudgetDateParams } from './types/common.types.js';
import { AppConfig } from './config/config.types.js';
import { CategorizeMode } from './types/enums.js';
import { CommandConfigError, requireCommandConfig } from './utils/command-config-validator.js';
import { logger } from './logger.js';
import { errorMessage, isCertificateError } from './utils/error-detection.utils.js';
import { CategorizeDisplayService } from './services/display/categorize-display.service.js';
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

/** What commander passes a report command; month and year always have defaults */
interface ReportCommandOptions {
    month: number;
    year: number;
    json?: boolean;
}

interface ReportCommandSpec {
    name: string;
    alias: string;
    description: string;
    examples: string;
    /** For the failure line: "Error <operation>: …" */
    operation: string;
    run: (params: BudgetDateParams) => Promise<unknown>;
}

/** Registers a report command (`analyze`, `report`) with the shared date and --json options */
const addReportCommand = (program: Command, spec: ReportCommandSpec): void => {
    withJsonOption(
        withDateOptions(program.command(spec.name).alias(spec.alias).description(spec.description))
    )
        .addHelpText('after', spec.examples)
        .action(async (opts: ReportCommandOptions) => {
            try {
                await spec.run(toReportParams(opts, program));
            } catch (error) {
                handleError(error, spec.operation);
            }
        });
};

const toReportParams = (opts: ReportCommandOptions, program: Command): BudgetDateParams => ({
    month: opts.month,
    year: opts.year,
    verbose: program.opts<{ verbose?: boolean }>().verbose ?? false,
    format: opts.json ? 'json' : 'text',
});

const withJsonOption = (command: Command): Command =>
    command.option(
        '--json',
        'print only a machine-readable JSON document to stdout (spinner and text report suppressed)'
    );

/** Commander already rejects a missing argument; this catches a blank one. */
const requireArg = (value: string, name: string, usage: string, example: string): void => {
    if (!value || value.trim() === '') {
        console.error(`❌ Error: ${name} is required and cannot be empty`);
        console.error(`\nUsage: ${usage}`);
        console.error(`Example: ${example}`);
        process.exit(1);
    }
};

const handleError = (error: unknown, operation: string): never => {
    printError(error, operation);
    process.exit(1);
};

const printError = (error: unknown, operation: string): void => {
    if (error instanceof CommandConfigError) {
        printCommandConfigError(error);
        return;
    }
    logger.error({ err: error }, `Error ${operation}:`);
    // The structured log is silent by default; the user still needs to see why it failed
    console.error(`Error ${operation}: ${errorMessage(error)}`);
};

const printCommandConfigError = ({ command, guidance, docsHint }: CommandConfigError): void => {
    console.error(chalk.red.bold(`\n❌ Configuration Error: ${command} command\n`));
    console.error(chalk.red(guidance) + '\n');
    console.error(chalk.yellow(docsHint));
};

/**
 * Never re-enters ConfigManager.getInstance: after the constructor threw, a second call would
 * throw the identical error.
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

    console.error('\nProblems found:');
    error.problems.forEach(problem => console.error(`  - ${problem}`));

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

/** Exits 1 after explaining why, when configuration cannot be loaded. */
const loadServices = (configPath?: string): { config: AppConfig; services: AppServices } => {
    try {
        const config = ConfigManager.getInstance(configPath).getConfig();
        logger.level = config.logging.level;

        const apiClient = new FireflyClientWithCerts({
            BASE: config.api.firefly.url + '/api',
            TOKEN: config.api.firefly.token,
            certificates: config.api.firefly.certificates,
        });

        return { config, services: ServiceFactory.createServices(apiClient, config) };
    } catch (error) {
        printConfigFailure(error);
        process.exit(1);
    }
};

export const createCli = (configPath?: string): Command => {
    const program = new Command();

    program
        .name('budgeting-toolkit')
        .description(packageJson.description)
        .version(packageJson.version)
        .option('-v, --verbose', 'show detailed transaction breakdowns in reports')
        .option('-c, --config <path>', 'path to config.yaml file');

    const { config, services } = loadServices(configPath);

    addReportCommand(program, {
        name: 'analyze',
        alias: 'an',
        description: 'Budget analysis with surplus/deficit variance',
        examples: `
Examples:
  $ budgeting-toolkit analyze                   # current month
  $ budgeting-toolkit analyze -m 6              # June, current year
  $ budgeting-toolkit analyze -m 12 -y 2024     # December 2024
  $ budgeting-toolkit an -m 3                   # March (using alias)
  $ budgeting-toolkit analyze -m 6 --json       # machine-readable output`,
        operation: 'analyzing budget',
        run: params => {
            requireCommandConfig(config, 'analyze');
            return createAnalyzeCommand(services, config).execute(params);
        },
    });

    addReportCommand(program, {
        name: 'report',
        alias: 'st',
        description: 'Display current budget report and spending analysis',
        examples: `
Examples:
  $ budgeting-toolkit report                      # current month report
  $ budgeting-toolkit report -m 8                 # August report
  $ budgeting-toolkit st                          # current month (using alias)
  $ budgeting-toolkit report -m 8 --json          # machine-readable output`,
        operation: 'getting budget report',
        run: params => createBudgetReportCommand(services).execute(params),
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
                const config = ConfigManager.getInstance().getConfig();
                requireCommandConfig(config, 'categorize');

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
                printError(error, 'categorizing transactions');
                if (isCertificateError(error)) {
                    console.error(new CategorizeDisplayService().formatCertificateHelp());
                }
                process.exit(1);
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
