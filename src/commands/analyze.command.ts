import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/common.types.js';
import { AnalyzeDisplayService } from '../services/display/analyze-display.service.js';
import { CashFlowService } from '../services/cash-flow.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { IBudgetService } from '../services/core/budget.service.interface.js';
import { allocationsByBudget } from '../services/core/budget.service.js';
import { AnalyzeReportDto } from '../types/dto/analyze-report.dto.js';
import { Result } from '../types/result.type.js';
import { serializeAnalyzeReport } from '../services/display/analyze-json.serializer.js';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';

/**
 * Command for analyzing budget variance
 */

export class AnalyzeCommand implements Command<AnalyzeReportDto, BudgetDateParams> {
    private readonly BUDGET_FAIL_MSG = 'Failed to generate variance analysis';

    constructor(
        private readonly cashFlowService: CashFlowService,
        private readonly billComparisonService: BillComparisonService,
        private readonly budgetService: IBudgetService,
        private readonly analyzeDisplayService: AnalyzeDisplayService,
        private readonly expectedMonthlyPaycheck: number
    ) {}

    /**
     * Executes the analyze command
     *
     * In `json` format the spinner is silenced and stdout carries nothing but
     * the JSON document, so it stays parseable; error messages still go to
     * stderr.
     *
     * @param params The month and year to perform the analysis
     * @returns The report DTO the output was built from
     */
    async execute({
        month,
        year,
        verbose,
        format = 'text',
    }: BudgetDateParams): Promise<AnalyzeReportDto> {
        const json = format === 'json';
        const spinner = ora({ text: `Analyzing ${month}-${year}...`, isSilent: json }).start();

        try {
            // BillComparisonService reads the same buckets; TransactionService
            // and AccountScopeService share one in-flight fetch between them
            const [bucketsResult, billComparisonResult, budgetLimits] = await Promise.all([
                this.cashFlowService.getBuckets(month, year),
                this.billComparisonService.calculateBillComparison(month, year),
                this.budgetService.getBudgetLimits(month, year),
            ]);

            const buckets = this.unwrap(bucketsResult, 'Error sorting transactions', spinner);
            const billComparison = this.unwrap(
                billComparisonResult,
                'Error calculating bill comparison',
                spinner
            );

            spinner.succeed('Analysis generated');

            const reportData = AnalyzeReportDto.create({
                buckets,
                billComparison,
                budgetAllocated: [...allocationsByBudget(budgetLimits).values()].reduce(
                    (sum, amount) => sum + amount,
                    0
                ),
                expectedMonthlyPaycheck: this.expectedMonthlyPaycheck,
                month,
                year,
            });

            if (json) {
                console.log(JSON.stringify(serializeAnalyzeReport(reportData), null, 2));
            } else {
                // Display the comprehensive report
                console.log(
                    this.analyzeDisplayService.formatAnalysisReport(reportData, verbose || false)
                );
            }

            return reportData;
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
