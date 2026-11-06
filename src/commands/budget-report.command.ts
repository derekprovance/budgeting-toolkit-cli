import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/common.types.js';
import { logger } from '../logger.js';
import { BudgetAnalyticsService } from '../services/budget-analytics.service.js';
import { BudgetInsightService } from '../services/budget-insight.service.js';
import { BudgetDisplayService } from '../services/display/budget-display.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { TransactionService } from '../services/core/transaction.service.js';
import { CashFlowService } from '../services/cash-flow.service.js';
import { BillComparisonDto } from '../types/dto/bill-comparison.dto.js';
import { BudgetReportResult } from '../types/dto/budget-report-result.dto.js';
import { daysLeftInMonth } from '../utils/days-left.utils.js';
import { serializeBudgetReport } from '../services/display/budget-report-json.serializer.js';
import { ReportProgress } from './report-progress.js';

export class BudgetReportCommand implements Command<BudgetReportResult, BudgetDateParams> {
    constructor(
        private readonly budgetAnalyticsService: BudgetAnalyticsService,
        private readonly budgetInsightService: BudgetInsightService,
        private readonly budgetDisplayService: BudgetDisplayService,
        private readonly billComparisonService: BillComparisonService,
        private readonly transactionService: TransactionService,
        private readonly cashFlowService: CashFlowService
    ) {}

    /** @returns The report data the output was built from */
    async execute({
        month,
        year,
        verbose,
        format = 'text',
    }: BudgetDateParams): Promise<BudgetReportResult> {
        const progress = new ReportProgress(
            'Generating budget report...',
            'Failed to generate budget report',
            format
        );
        return progress.run(async () => {
            const report = await this.buildReport(month, year, progress);
            progress.print(
                () => serializeBudgetReport(report),
                () => this.budgetDisplayService.formatReport(report, verbose || false)
            );
            return report;
        });
    }

    private async buildReport(
        month: number,
        year: number,
        progress: ReportProgress
    ): Promise<BudgetReportResult> {
        const daysInfo = await this.getDaysInfo(month, year);

        progress.step('Fetching budget data...');
        const [budgets, topExpenses, billComparisonResult, bucketsResult] = await Promise.all([
            this.budgetAnalyticsService.getBudgetReport(month, year, 1),
            this.budgetAnalyticsService.getTopExpenses(month, year, 5),
            this.billComparisonService.calculateBillComparison(month, year),
            this.cashFlowService.getBuckets(month, year),
        ]);

        const buckets = progress.unwrap(bucketsResult, 'Error sorting transactions');

        if (!billComparisonResult.ok) {
            progress.warn('Warning: Bill comparison data unavailable');
            logger.warn(
                { error: billComparisonResult.error.message },
                'Failed to fetch bill comparison'
            );
        }

        progress.step('Generating insights...');

        const billComparison = billComparisonResult.ok
            ? billComparisonResult.value
            : BillComparisonDto.empty();

        const insights = this.budgetInsightService.generateInsights(budgets, billComparison);

        progress.succeed('Budget report generated');

        return {
            budgets,
            topExpenses,
            billComparison,
            unbudgeted: buckets.unbudgeted,
            insights,
            month,
            year,
            daysInfo,
        };
    }

    /** Days left and data freshness, for the current month only */
    private async getDaysInfo(
        month: number,
        year: number
    ): Promise<BudgetReportResult['daysInfo']> {
        const today = new Date();
        if (today.getMonth() + 1 !== month || today.getFullYear() !== year) {
            return undefined;
        }
        return {
            daysLeft: daysLeftInMonth(month, year, today),
            // A month can look cheap simply because its last days are not imported yet
            dataThrough: await this.transactionService.getMostRecentTransactionDate(),
        };
    }
}
