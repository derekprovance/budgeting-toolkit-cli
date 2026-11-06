import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/common.types.js';
import { AnalyzeDisplayService } from '../services/display/analyze-display.service.js';
import { CashFlowService } from '../services/cash-flow.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { IBudgetService } from '../services/core/budget.service.interface.js';
import { allocationsByBudget } from '../services/core/budget.service.js';
import { AnalyzeReportDto } from '../types/dto/analyze-report.dto.js';
import { serializeAnalyzeReport } from '../services/display/analyze-json.serializer.js';
import { ReportProgress } from './report-progress.js';

/**
 * Command for analyzing budget variance
 */

export class AnalyzeCommand implements Command<AnalyzeReportDto, BudgetDateParams> {
    constructor(
        private readonly cashFlowService: CashFlowService,
        private readonly billComparisonService: BillComparisonService,
        private readonly budgetService: IBudgetService,
        private readonly analyzeDisplayService: AnalyzeDisplayService,
        private readonly expectedMonthlyPaycheck: number
    ) {}

    /**
     * Prints the month's analysis as text or, in `json` format, as the JSON
     * document alone (see ReportProgress).
     *
     * @returns The report DTO the output was built from
     */
    async execute({
        month,
        year,
        verbose,
        format = 'text',
    }: BudgetDateParams): Promise<AnalyzeReportDto> {
        const progress = new ReportProgress(
            `Analyzing ${month}-${year}...`,
            'Failed to generate variance analysis',
            format
        );
        return progress.run(async () => {
            const report = await this.buildReport(month, year, progress);
            progress.print(
                () => serializeAnalyzeReport(report),
                () => this.analyzeDisplayService.formatAnalysisReport(report, verbose || false)
            );
            return report;
        });
    }

    private async buildReport(
        month: number,
        year: number,
        progress: ReportProgress
    ): Promise<AnalyzeReportDto> {
        // BillComparisonService reads the same buckets; TransactionService
        // and AccountScopeService share one in-flight fetch between them
        const [bucketsResult, billComparisonResult, budgetLimits] = await Promise.all([
            this.cashFlowService.getBuckets(month, year),
            this.billComparisonService.calculateBillComparison(month, year),
            this.budgetService.getBudgetLimits(month, year),
        ]);

        const buckets = progress.unwrap(bucketsResult, 'Error sorting transactions');
        const billComparison = progress.unwrap(
            billComparisonResult,
            'Error calculating bill comparison'
        );

        progress.succeed('Analysis generated');

        return AnalyzeReportDto.create({
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
    }
}
