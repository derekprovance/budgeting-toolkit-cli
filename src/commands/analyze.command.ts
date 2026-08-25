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
import { ITransactionService } from '../services/core/transaction.service.interface.js';
import { ITransactionClassificationService } from '../services/core/transaction-classification.service.interface.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { Result } from '../types/result.type.js';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';

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
        private readonly transactionService: ITransactionService,
        private readonly transactionClassificationService: ITransactionClassificationService
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
                excludedTransactions,
            ] = await Promise.all([
                this.additionalIncomeService.calculateAdditionalIncome(month, year),
                this.unbudgetedExpenseService.calculateUnbudgetedExpenses(month, year),
                this.paycheckSurplusService.calculatePaycheckSurplus(month, year),
                this.disposableIncomeService.calculateDisposableIncome(month, year),
                this.budgetSurplusService.calculateBudgetSurplus(month, year),
                this.billComparisonService.calculateBillComparison(month, year),
                this.transactionService.getExcludedTransactionsForMonth(month, year),
            ]);

            const additionalIncome = this.unwrap(
                additionalIncomeResult,
                'Error fetching additional income',
                spinner
            );
            const unbudgetedExpenses = this.unwrap(
                unbudgetedExpenseResult,
                'Error fetching unbudgeted expenses',
                spinner
            );
            const paycheck = this.unwrap(
                paycheckSurplusResult,
                'Error calculating paycheck surplus',
                spinner
            );
            const disposableIncome = this.unwrap(
                disposableIncomeResult,
                'Error calculating disposable income',
                spinner
            );
            const budgetResult = this.unwrap(
                budgetSurplusResult,
                'Error calculating budget surplus',
                spinner
            );
            const billComparison = this.unwrap(
                billComparisonResult,
                'Error calculating bill comparison',
                spinner
            );

            spinner.succeed('Analysis generated');

            // Extract budget values from result
            const budgetAllocated = budgetResult.totalAllocated;

            // budgetSpent comes from Firefly's server-side rollup, which knows
            // nothing about the local exclusion list. An excluded transaction
            // carrying a budget is therefore still inside it, even though every
            // locally-computed bucket dropped it. Take it back out so the two
            // sides describe the same set of transactions.
            const excludedBudgetSpend = TransactionCalculationUtils.calculateNetSpend(
                excludedTransactions.filter(t => this.transactionClassificationService.hasBudget(t))
            );
            const budgetSpent = Math.max(0, budgetResult.totalSpent - excludedBudgetSpend);
            const budgetSurplus = budgetAllocated - budgetSpent;

            // Build comprehensive report DTO
            const reportData = AnalyzeReportDto.create(
                additionalIncome,
                unbudgetedExpenses,
                budgetAllocated,
                budgetSpent,
                budgetSurplus,
                billComparison,
                paycheck.expected,
                paycheck.actual,
                paycheck.surplus,
                disposableIncome.transactions,
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
            // unwrap() already failed the spinner for a Result error; only an
            // unexpected throw leaves it still spinning.
            if (spinner.isSpinning) {
                spinner.fail(this.BUDGET_FAIL_MSG);
            }
            throw error;
        }
    }

    /**
     * Unwraps a Result, printing the user-facing message and throwing on error.
     *
     * Stops the spinner FIRST. Ora renders to stderr on an interval and clears
     * its line each frame, so writing the error while it is still spinning can
     * see that line overwritten. BudgetReportCommand orders it the same way.
     */
    private unwrap<T, E extends { message: string; userMessage: string }>(
        result: Result<T, E>,
        label: string,
        spinner: Ora
    ): T {
        if (!result.ok) {
            spinner.fail(this.BUDGET_FAIL_MSG);
            console.error(chalk.red(`${label}:`), chalk.red.bold(result.error.userMessage));
            throw new Error(result.error.message);
        }
        return result.value;
    }
}
