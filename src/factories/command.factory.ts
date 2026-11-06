import { AnalyzeCommand } from '../commands/analyze.command.js';
import { BudgetReportCommand } from '../commands/budget-report.command.js';
import { AppServices } from './service.factory.js';
import { AppConfig } from '../config/config.types.js';

/** Shared by the CLI and the in-process harness, so the harness runs the commands a user runs. */
export function createAnalyzeCommand(services: AppServices, config: AppConfig): AnalyzeCommand {
    return new AnalyzeCommand(
        services.cashFlowService,
        services.billComparisonService,
        services.budgetService,
        services.analyzeDisplayService,
        // requireCommandConfig requires it before analyze runs
        config.transactions.expectedMonthlyPaycheck ?? 0
    );
}

export function createBudgetReportCommand(services: AppServices): BudgetReportCommand {
    return new BudgetReportCommand(
        services.budgetAnalyticsService,
        services.budgetInsightService,
        services.budgetDisplayService,
        services.billComparisonService,
        services.transactionService,
        services.cashFlowService
    );
}
