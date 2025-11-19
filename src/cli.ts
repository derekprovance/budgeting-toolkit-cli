import { Command, Option } from 'commander';
import { FireflyClientWithCerts } from './api/firefly-client-with-certs';
import { config, validateCertificateConfig } from './config';
import { FinalizeBudgetCommand } from './commands/finalize-budget.command';
import { BudgetReportCommand } from './commands/budget-report.command';
import { UpdateTransactionsCommand } from './commands/update-transaction.command';
import { ServiceFactory } from './factories/service.factory';
import {
    BudgetDateOptions,
    UpdateTransactionOptions,
} from './types/interface/command-options.interface';
import { UpdateTransactionMode } from './types/enum/update-transaction-mode.enum';
import { logger } from './logger';
import { readFileSync } from 'fs';
import { join } from 'path';

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

const handleError = (error: unknown, operation: string): never => {
    logger.error({ error }, `Error ${operation}:`);
    process.exit(1);
};

export const createCli = (): Command => {
    const program = new Command();

    // Initialize API client with error handling
    let apiClient: FireflyClientWithCerts;
    let services: ReturnType<typeof ServiceFactory.createServices>;

    try {
        // Validate certificate configuration before attempting to create client
        validateCertificateConfig(config);

        apiClient = new FireflyClientWithCerts(config);
        services = ServiceFactory.createServices(apiClient);
    } catch (error) {
        console.error(
            'Failed to initialize API client:',
            error instanceof Error ? error.message : String(error)
        );
        console.log('\nCheck your configuration:');
        console.log('  - .env file with FIREFLY_API_URL and FIREFLY_API_TOKEN');
        console.log('  - Certificate paths (if using mTLS): CLIENT_CERT_PATH, CLIENT_CERT_CA_PATH');
        process.exit(1);
    }

    program
        .name('budgeting-toolkit')
        .description(packageJson.description)
        .version(packageJson.version)
        .option('-v, --verbose', 'enable verbose logging')
        .option('-q, --quiet', 'suppress all output except errors')
        .hook('preAction', thisCommand => {
            const opts = thisCommand.opts();
            if (opts.verbose) {
                process.env.LOG_LEVEL = 'debug';
            } else if (opts.quiet) {
                process.env.LOG_LEVEL = 'error';
            }
        });

    program
        .command('finalize')
        .alias('fin')
        .description('Calculate budget finalization report with surplus/deficit analysis')
        .addOption(
            new Option('-m, --month <month>', 'target month (1-12)')
                .argParser(validateMonth)
                .default(getCurrentMonth(), 'current month')
        )
        .addOption(
            new Option('-y, --year <year>', 'target year')
                .argParser(validateYear)
                .default(getCurrentYear(), 'current year')
        )
        .addHelpText(
            'after',
            `
Examples:
  $ budgeting-toolkit finalize                   # current month
  $ budgeting-toolkit finalize -m 6              # June, current year
  $ budgeting-toolkit finalize -m 12 -y 2024     # December 2024
  $ budgeting-toolkit fin -m 3                   # March (using alias)`
        )
        .action(async (opts: BudgetDateOptions) => {
            try {
                const command = new FinalizeBudgetCommand(
                    services.additionalIncomeService,
                    services.unbudgetedExpenseService,
                    services.transactionClassificationService,
                    services.paycheckSurplusService,
                    services.finalizeBudgetDisplayService
                );
                await command.execute({
                    month: opts.month!,
                    year: opts.year!,
                });
            } catch (error) {
                handleError(error, 'finalizing budget');
            }
        });

    program
        .command('report')
        .alias('st')
        .description('Display current budget report and spending analysis')
        .addOption(
            new Option('-m, --month <month>', 'target month (1-12)')
                .argParser(validateMonth)
                .default(getCurrentMonth(), 'current month')
        )
        .addOption(
            new Option('-y, --year <year>', 'target year')
                .argParser(validateYear)
                .default(getCurrentYear(), 'current year')
        )
        .addHelpText(
            'after',
            `
Examples:
  $ budgeting-toolkit report                      # current month report
  $ budgeting-toolkit report -m 8                 # August report
  $ budgeting-toolkit rp                          # current month (using alias)`
        )
        .action(async (opts: BudgetDateOptions) => {
            try {
                const command = new BudgetReportCommand(
                    services.budgetReport,
                    services.transactionService,
                    services.budgetDisplayService,
                    services.billComparisonService
                );
                await command.execute({
                    month: opts.month!,
                    year: opts.year!,
                    verbose: program?.opts().verbose || false,
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
            '-i, --include-classified',
            'process transactions that already have categories/budgets assigned'
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
  $ budgeting-toolkit categorize Import-2025-06-23 -i           # include already categorized
  $ budgeting-toolkit categorize Import-2025-06-23 -n           # preview changes only
  $ budgeting-toolkit categorize Import-2025-06-23 -m category  # categories only`
        )
        .action(async (tag: string, opts: UpdateTransactionOptions) => {
            if (!tag || tag.trim() === '') {
                console.error('❌ Error: Tag parameter is required and cannot be empty');
                console.log('\nUsage: budgeting-toolkit categorize <tag> [options]');
                console.log('Example: budgeting-toolkit categorize Import-2025-06-23');
                process.exit(1);
            }

            try {
                const updateTransactionService =
                    await ServiceFactory.createUpdateTransactionService(
                        apiClient,
                        opts.includeClassified,
                        opts.dryRun
                    );

                const command = new UpdateTransactionsCommand(updateTransactionService);
                await command.execute({
                    tag,
                    updateMode: opts.mode as UpdateTransactionMode,
                    dryRun: opts.dryRun,
                });
            } catch (error) {
                handleError(error, 'categorizing transactions');
            }
        });

    return program;
};
