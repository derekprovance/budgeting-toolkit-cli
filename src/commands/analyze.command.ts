import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/interface/budget-date-params.interface.js';
import { AdditionalIncomeService } from '../services/additional-income.service.js';
import { UnbudgetedExpenseService } from '../services/unbudgeted-expense.service.js';
import { AnalyzeDisplayService } from '../services/display/analyze-display.service.js';
import { PaycheckSurplusService } from '../services/paycheck-surplus.service.js';
import { DisposableIncomeService } from '../services/disposable-income.service.js';
import { BudgetSurplusService } from '../services/budget-surplus.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { AnalyzeReportDto } from '../types/dto/analyze-report.dto.js';
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
        private readonly paycheckSurplusService: PaycheckSurplusService,
        private readonly disposableIncomeService: DisposableIncomeService,
        private readonly budgetSurplusService: BudgetSurplusService,
        private readonly billComparisonService: BillComparisonService,
        private readonly analyzeDisplayService: AnalyzeDisplayService
    ) {}

    /**
     * Executes the analyze command
     * @param params The month and year to perform the analysis
     */
    async execute({ month, year, verbose }: BudgetDateParams): Promise<void> {
        const spinner = ora(`Analyzing ${month}-${year}...`).start();

        // Validate command-specific configuration
        const config = ConfigManager.getInstance().getConfig();
        CommandConfigValidator.validateAnalyzeCommand(config);

        try {
            // Fetch all analysis data in parallel
            const [
                additionalIncomeResult,
                unbudgetedExpenseResult,
                paycheckSurplusResult,
                disposableIncomeResult,
                budgetSurplusResult,
                billComparisonResult,
            ] = await Promise.all([
                this.additionalIncomeService.calculateAdditionalIncome(month, year),
                this.unbudgetedExpenseService.calculateUnbudgetedExpenses(month, year),
                this.paycheckSurplusService.calculatePaycheckSurplus(month, year),
                this.disposableIncomeService.calculateDisposableIncome(month, year),
                this.budgetSurplusService.calculateBudgetSurplus(month, year),
                this.billComparisonService.calculateBillComparison(month, year),
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

            // Handle disposable income result
            if (!disposableIncomeResult.ok) {
                spinner.fail(this.BUDGET_FAIL_MSG);
                console.error(
                    chalk.red('Error calculating disposable income:'),
                    chalk.red.bold(disposableIncomeResult.error.userMessage)
                );
                throw new Error(disposableIncomeResult.error.message);
            }

            // Handle budget surplus result
            if (!budgetSurplusResult.ok) {
                spinner.fail(this.BUDGET_FAIL_MSG);
                console.error(
                    chalk.red('Error calculating budget surplus:'),
                    chalk.red.bold(budgetSurplusResult.error.userMessage)
                );
                throw new Error(budgetSurplusResult.error.message);
            }

            // Handle bill comparison result
            if (!billComparisonResult.ok) {
                spinner.fail(this.BUDGET_FAIL_MSG);
                console.error(
                    chalk.red('Error calculating bill comparison:'),
                    chalk.red.bold(billComparisonResult.error.userMessage)
                );
                throw new Error(billComparisonResult.error.message);
            }

            spinner.succeed('Analysis generated');

            // Extract values from Result types
            const additionalIncome = additionalIncomeResult.value;
            const unbudgetedExpenses = unbudgetedExpenseResult.value;
            const paycheckSurplus = paycheckSurplusResult.value;
            const disposableIncome = disposableIncomeResult.value;
            const budgetResult = budgetSurplusResult.value;
            const billComparison = billComparisonResult.value;

            // Extract budget values from result
            const budgetAllocated = budgetResult.totalAllocated;
            const budgetSpent = budgetResult.totalSpent;
            const budgetSurplus = budgetResult.surplus;

            // Get expected paycheck from config
            const expectedMonthlyPaycheck = config.transactions.expectedMonthlyPaycheck || 0;

            // Calculate actual paycheck
            const actualPaycheck = expectedMonthlyPaycheck + paycheckSurplus;

            // Build comprehensive report DTO
            const reportData = AnalyzeReportDto.create(
                additionalIncome,
                unbudgetedExpenses,
                budgetAllocated,
                budgetSpent,
                budgetSurplus,
                billComparison,
                expectedMonthlyPaycheck,
                actualPaycheck,
                paycheckSurplus,
                disposableIncome,
                month,
                year
            );

            // Display the comprehensive report
            console.log(this.analyzeDisplayService.formatAnalysisReport(reportData, verbose || false));
        } catch (error) {
            spinner.fail(this.BUDGET_FAIL_MSG);
            throw error;
        }
    }
}
