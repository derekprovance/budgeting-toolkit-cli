import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/common.types.js';
import { AdditionalIncomeService } from '../services/additional-income.service.js';
import { UnbudgetedExpenseService } from '../services/unbudgeted-expense.service.js';
import { AnalyzeDisplayService } from '../services/display/analyze-display.service.js';
import { PaycheckSurplusService } from '../services/paycheck-surplus.service.js';
import { DisposableIncomeService } from '../services/disposable-income.service.js';
import { BudgetSurplusService } from '../services/budget-surplus.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { AnalyzeReportDto } from '../types/dto/analyze-report.dto.js';
import { Result } from '../types/result.type.js';
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
        private readonly analyzeDisplayService: AnalyzeDisplayService,
        private readonly expectedMonthlyPaycheck: number = 0
    ) {}

    /**
     * Executes the analyze command
     * @param params The month and year to perform the analysis
     */
    async execute({ month, year, verbose }: BudgetDateParams): Promise<void> {
        const spinner = ora(`Analyzing ${month}-${year}...`).start();

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

            const additionalIncome = this.unwrap(
                additionalIncomeResult,
                'Error fetching additional income'
            );
            const unbudgetedExpenses = this.unwrap(
                unbudgetedExpenseResult,
                'Error fetching unbudgeted expenses'
            );
            const paycheckSurplus = this.unwrap(
                paycheckSurplusResult,
                'Error calculating paycheck surplus'
            );
            const disposableIncome = this.unwrap(
                disposableIncomeResult,
                'Error calculating disposable income'
            );
            const budgetResult = this.unwrap(
                budgetSurplusResult,
                'Error calculating budget surplus'
            );
            const billComparison = this.unwrap(
                billComparisonResult,
                'Error calculating bill comparison'
            );

            spinner.succeed('Analysis generated');

            // Extract budget values from result
            const budgetAllocated = budgetResult.totalAllocated;
            const budgetSpent = budgetResult.totalSpent;
            const budgetSurplus = budgetResult.surplus;

            // Calculate actual paycheck
            const actualPaycheck = this.expectedMonthlyPaycheck + paycheckSurplus;

            // Build comprehensive report DTO
            const reportData = AnalyzeReportDto.create(
                additionalIncome,
                unbudgetedExpenses,
                budgetAllocated,
                budgetSpent,
                budgetSurplus,
                billComparison,
                this.expectedMonthlyPaycheck,
                actualPaycheck,
                paycheckSurplus,
                disposableIncome.transactions,
                disposableIncome.transfers,
                disposableIncome.balance,
                month,
                year,
                disposableIncome.budgetedTransactions
            );

            // Display the comprehensive report
            console.log(
                this.analyzeDisplayService.formatAnalysisReport(reportData, verbose || false)
            );
        } catch (error) {
            spinner.fail(this.BUDGET_FAIL_MSG);
            throw error;
        }
    }

    /**
     * Unwraps a Result, printing the user-facing message and throwing on error.
     * The outer catch owns the spinner failure state.
     */
    private unwrap<T, E extends { message: string; userMessage: string }>(
        result: Result<T, E>,
        label: string
    ): T {
        if (!result.ok) {
            console.error(chalk.red(`${label}:`), chalk.red.bold(result.error.userMessage));
            throw new Error(result.error.message);
        }
        return result.value;
    }
}
