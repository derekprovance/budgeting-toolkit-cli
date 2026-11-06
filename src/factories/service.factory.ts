import { FireflyClientWithCerts } from '../api/firefly-client-with-certs.js';
import { TransactionService } from '../services/core/transaction.service.js';
import { BudgetService } from '../services/core/budget.service.js';
import { CategoryService } from '../services/core/category.service.js';
import { BudgetReportService } from '../services/budget-report.service.js';
import { ExcludedTransactionService } from '../services/excluded-transaction.service.js';
import { TransactionClassificationService } from '../services/core/transaction-classification.service.js';
import { AccountScopeService } from '../services/core/account-scope.service.js';
import { CashFlowService } from '../services/cash-flow.service.js';
import { TransactionValidatorService } from '../services/core/transaction-validator.service.js';
import { TransactionAIResultValidator } from '../services/core/transaction-ai-result-validator.service.js';
import { LLMAssignmentService } from '../services/ai/llm-assignment.service.js';
import { LLMTransactionProcessingService } from '../services/ai/llm-transaction-processing.service.js';
import { TransactionHistoryService } from '../services/transaction-history.service.js';
import { AITransactionUpdateOrchestrator } from '../services/ai-transaction-update-orchestrator.service.js';
import { createClaudeClient } from '../config/llm.config.js';
import { UserInputService } from '../services/user-input.service.js';
import { InteractiveTransactionUpdater } from '../services/interactive-transaction-updater.service.js';
import { ConfigManager } from '../config/config-manager.js';
import { AnalyzeDisplayService } from '../services/display/analyze-display.service.js';
import { SplitTransactionDisplayService } from '../services/display/split-transaction-display.service.js';
import { BillService } from '../services/core/bill.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { TransactionSplitService } from '../services/transaction-split.service.js';
import { DateRangeService } from '../services/core/date-range.service.js';
import { BudgetAnalyticsService } from '../services/budget-analytics.service.js';
import { BudgetInsightService } from '../services/budget-insight.service.js';
import { BudgetDisplayService } from '../services/display/budget-display.service.js';
import { AppConfig } from '../config/config.types.js';

/** Every service the CLI wires, as returned by {@link ServiceFactory.createServices}. */
export type AppServices = ReturnType<typeof ServiceFactory.createServices>;

export class ServiceFactory {
    /**
     * Wires every service from one configuration.
     *
     * @param apiClient Firefly III client every API-backed service shares
     * @param config Application configuration. Defaults to the ConfigManager
     *   singleton; tests and the in-process harness pass their own so that no
     *   config file or `.env` is ever read.
     */
    static createServices(
        apiClient: FireflyClientWithCerts,
        config: AppConfig = ConfigManager.getInstance().getConfig()
    ) {
        const dateRangeService = new DateRangeService();
        const budgetService = new BudgetService(apiClient, dateRangeService);
        const categoryService = new CategoryService(apiClient);
        const userInputService = new UserInputService(config.api.firefly.url);
        const excludedTransactionService = new ExcludedTransactionService(
            config.transactions.excludedTransactions
        );

        const accountScopeService = new AccountScopeService(
            apiClient,
            config.accounts.untrackedAccounts
        );

        const transactionService = new TransactionService(
            excludedTransactionService,
            apiClient,
            dateRangeService
        );

        const transactionClassificationService = new TransactionClassificationService(
            config.transactions.tags.disposableIncome,
            config.transactions.tags.paycheck
        );
        const cashFlowService = new CashFlowService(
            transactionService,
            transactionClassificationService,
            accountScopeService
        );

        const transactionValidatorService = new TransactionValidatorService(
            transactionClassificationService
        );
        const budgetReport = new BudgetReportService(budgetService, cashFlowService);
        const analyzeDisplayService = new AnalyzeDisplayService(transactionClassificationService);
        const splitTransactionDisplayService = new SplitTransactionDisplayService(
            config.api.firefly.url
        );
        const billService = new BillService(apiClient, dateRangeService);
        const billComparisonService = new BillComparisonService(billService, cashFlowService);
        const transactionSplitService = new TransactionSplitService(apiClient);
        const budgetAnalyticsService = new BudgetAnalyticsService(budgetReport, cashFlowService);
        const budgetInsightService = new BudgetInsightService();
        const budgetDisplayService = new BudgetDisplayService(config.api.firefly.url);

        return {
            transactionService,
            budgetService,
            categoryService,
            userInputService,
            cashFlowService,
            budgetReport,
            transactionClassificationService,
            excludedTransactionService,
            transactionValidatorService,
            analyzeDisplayService,
            splitTransactionDisplayService,
            billService,
            billComparisonService,
            transactionSplitService,
            budgetAnalyticsService,
            budgetInsightService,
            budgetDisplayService,
        };
    }

    static async createAITransactionUpdateOrchestrator(
        services: AppServices,
        force: boolean = false,
        dryRun: boolean = false,
        config: AppConfig = ConfigManager.getInstance().getConfig()
    ): Promise<AITransactionUpdateOrchestrator> {
        const llmAssignmentService = new LLMAssignmentService(createClaudeClient(config), {
            batchSize: config.llm.batchSize,
            maxConcurrent: config.llm.maxConcurrent,
        });
        const llmProcessingService = new LLMTransactionProcessingService(llmAssignmentService);

        // Create AI validator service using factory method
        const aiValidator = await TransactionAIResultValidator.create(
            services.categoryService,
            services.budgetService,
            services.transactionValidatorService
        );

        // Create interactive transaction updater with service dependencies
        const interactiveTransactionUpdater = new InteractiveTransactionUpdater(
            services.transactionService,
            services.transactionValidatorService,
            aiValidator,
            services.userInputService,
            dryRun
        );

        return new AITransactionUpdateOrchestrator(
            services.transactionService,
            interactiveTransactionUpdater,
            services.categoryService,
            services.budgetService,
            llmProcessingService,
            services.transactionValidatorService,
            force,
            dryRun,
            new TransactionHistoryService(
                services.transactionService,
                config.categorize.historyMonths,
                {
                    canCarryBudget: t => services.transactionValidatorService.shouldSetBudget(t),
                }
            )
        );
    }
}
