import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/interface/budget-date-params.interface.js';
import { AdditionalIncomeService } from '../services/additional-income.service.js';
import { UnbudgetedExpenseService } from '../services/unbudgeted-expense.service.js';
import { TransactionClassificationService } from '../services/core/transaction-classification.service.js';
import { AnalyzeDisplayService } from '../services/display/analyze-display.service.js';
import { PaycheckSurplusService } from '../services/paycheck-surplus.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { TransactionCounts } from '../services/display/analyze-display.service.js';
import { CommandConfigValidator } from '../utils/command-config-validator.js';
import { ConfigManager } from '../config/config-manager.js';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Command for analyzing budget variance
 */

export class AnalyzeCommand implements Command<void, BudgetDateParams> {
    private readonly BUDGET_FAIL_MSG = 'Failed to generate variance analysis';

    constructor(
        private readonly additionalIncomeService: AdditionalIncomeService,
        private readonly unbudgetedExpenseService: UnbudgetedExpenseService,
        private readonly transactionClassificationService: TransactionClassificationService,
        private readonly paycheckSurplusService: PaycheckSurplusService,
        private readonly analyzeDisplayService: AnalyzeDisplayService
    ) {}

    /**
     * Executes the analyze command
     * @param params The month and year to perform the analysis
     */

    //TODO(DEREK) - show total of transactions with the disposable income tag somewhere in the report
    //TODO(DEREK) - calculate the budget surplus or deficit and add to the calculation
    //TODO(DEREK) - calculate the actual bill cost over the average monthly bill cost and add to calculation
    //TODO - add a calculation to determine the difference between the expenses and the additional income
    //TODO - add verbose to command output for transactions that are expenses within the filter and additional income
    //TODO(ai) - reformat the command output to something that's more readable and pleasing
    async execute({ month, year, verbose }: BudgetDateParams): Promise<void> {
        const spinner = ora(`Analyzing ${month}-${year}...`).start();

        // Validate command-specific configuration
        const config = ConfigManager.getInstance().getConfig();
        CommandConfigValidator.validateAnalyzeCommand(config);

        console.log(this.analyzeDisplayService.formatHeader('Budget Finalization Report'));

        try {
            const [additionalIncomeResult, unbudgetedExpenseResult, paycheckSurplusResult] =
                await Promise.all([
                    this.additionalIncomeService.calculateAdditionalIncome(month, year),
                    this.unbudgetedExpenseService.calculateUnbudgetedExpenses(month, year),
                    this.paycheckSurplusService.calculatePaycheckSurplus(month, year),
                ]);

            // Handle additional income result
            if (!additionalIncomeResult.ok) {
                spinner.fail(this.BUDGET_FAIL_MSG);
                console.error(
                    chalk.red('Error fetching additional income:'),
                    chalk.red.bold(additionalIncomeResult.error.userMessage)
                );
                throw new Error(additionalIncomeResult.error.message);
            }

            // Handle unbudgeted expense result
            if (!unbudgetedExpenseResult.ok) {
                spinner.fail(this.BUDGET_FAIL_MSG);
                console.error(
                    chalk.red('Error fetching unbudgeted expenses:'),
                    chalk.red.bold(unbudgetedExpenseResult.error.userMessage)
                );
                throw new Error(unbudgetedExpenseResult.error.message);
            }

            // Handle paycheck surplus result
            if (!paycheckSurplusResult.ok) {
                spinner.fail(this.BUDGET_FAIL_MSG);
                console.error(
                    chalk.red('Error calculating paycheck surplus:'),
                    chalk.red.bold(paycheckSurplusResult.error.userMessage)
                );
                throw new Error(paycheckSurplusResult.error.message);
            }

            spinner.succeed('Analysis generated');

            const additionalIncomeResults = additionalIncomeResult.value;
            const unbudgetedExpenseResults = unbudgetedExpenseResult.value;
            const paycheckSurplus = paycheckSurplusResult.value;

            console.log(this.analyzeDisplayService.formatMonthHeader(month, year));

            // Display additional income section
            console.log(
                this.analyzeDisplayService.formatAdditionalIncomeSection(additionalIncomeResults)
            );

            // Display unbudgeted expenses section
            console.log(
                this.analyzeDisplayService.formatUnbudgetedExpensesSection(unbudgetedExpenseResults)
            );

            // Calculate and display enhanced summary
            const allTransactions = [...additionalIncomeResults, ...unbudgetedExpenseResults];
            const counts = this.getTransactionCounts(allTransactions);
            console.log(
                this.analyzeDisplayService.formatSummary(
                    counts,
                    additionalIncomeResults,
                    unbudgetedExpenseResults,
                    paycheckSurplus
                )
            );
        } catch (error) {
            spinner.fail(this.BUDGET_FAIL_MSG);
            throw error;
        }
    }

    //TODO - assess if function still needed in refactor
    private getTransactionCounts(transactions: TransactionSplit[]): TransactionCounts {
        let bills = 0;
        let transfers = 0;
        let deposits = 0;
        let other = 0;

        transactions.forEach(t => {
            if (this.transactionClassificationService.isBill(t)) {
                bills++;
            } else if (this.transactionClassificationService.isTransfer(t)) {
                transfers++;
            } else if (this.transactionClassificationService.isDeposit(t)) {
                deposits++;
            } else {
                other++;
            }
        });

        return {
            bills,
            transfers,
            deposits,
            other,
        };
    }
}
