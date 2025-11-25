import { Command, Option } from 'commander';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { FireflyClientWithCerts } from './api/firefly-client-with-certs.js';
import { ConfigManager } from './config/config-manager.js';
import { FinalizeBudgetCommand } from './commands/finalize-budget.command.js';
import { BudgetReportCommand } from './commands/budget-report.command.js';
import { UpdateTransactionsCommand } from './commands/update-transaction.command.js';
import { SplitTransactionCommand } from './commands/split-transaction.command.js';
import { ServiceFactory } from './factories/service.factory.js';
import {
    BudgetDateOptions,
    UpdateTransactionOptions,
} from './types/interface/command-options.interface.js';
import { UpdateTransactionMode } from './types/enum/update-transaction-mode.enum.js';
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

const handleError = (error: unknown, operation: string): never => {
    logger.error({ error }, `Error ${operation}:`);
    process.exit(1);
};

export const createCli = (): Command => {
    const program = new Command();

    let apiClient: FireflyClientWithCerts;
    let services: ReturnType<typeof ServiceFactory.createServices>;

    try {
        const config = ConfigManager.getInstance().getConfig();

        // Create Firefly client with properly formatted config
        apiClient = new FireflyClientWithCerts({
            BASE: config.api.firefly.url + '/api',
            TOKEN: config.api.firefly.token,
            caCertPath: config.api.firefly.certificates?.caCertPath,
            clientCertPath: config.api.firefly.certificates?.clientCertPath,
            clientCertPassword: config.api.firefly.certificates?.clientCertPassword,
        });

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
        .option('-v, --verbose', 'enable verbose logging');

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
                // Validate command-specific configuration (including ANTHROPIC_API_KEY)
                const config = ConfigManager.getInstance().getConfig();
                CommandConfigValidator.validateCategorizeCommand(config);

                const aiTransactionUpdateOrchestrator =
                    await ServiceFactory.createAITransactionUpdateOrchestrator(
                        apiClient,
                        opts.includeClassified,
                        opts.dryRun
                    );

                const command = new UpdateTransactionsCommand(aiTransactionUpdateOrchestrator);
                await command.execute({
                    tag,
                    updateMode: opts.mode as UpdateTransactionMode,
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
                if (!transactionId || transactionId.trim() === '') {
                    console.error('❌ Error: Transaction ID is required');
                    console.log('\nUsage: budgeting-toolkit split <transaction-id> [options]');
                    console.log('Example: budgeting-toolkit split 4361');
                    process.exit(1);
                }

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
