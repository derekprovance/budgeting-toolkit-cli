import { FireflyClientWithCerts } from '../api/firefly-client-with-certs.js';
import { TransactionService } from '../services/core/transaction.service.js';
import { BudgetService } from '../services/core/budget.service.js';
import { CategoryService } from '../services/core/category.service.js';
import { AdditionalIncomeService } from '../services/additional-income.service.js';
import { UnbudgetedExpenseService } from '../services/unbudgeted-expense.service.js';
import { BudgetReportService } from '../services/budget-report.service.js';
import { ExcludedTransactionService } from '../services/excluded-transaction.service.js';
import { TransactionClassificationService } from '../services/core/transaction-classification.service.js';
import { AccountScopeService } from '../services/core/account-scope.service.js';
import { PaycheckSurplusService } from '../services/paycheck-surplus.service.js';
import { TransactionValidatorService } from '../services/core/transaction-validator.service.js';
import { TransactionAIResultValidator } from '../services/core/transaction-ai-result-validator.service.js';
import { LLMAssignmentService } from '../services/ai/llm-assignment.service.js';
import { LLMTransactionProcessingService } from '../services/ai/llm-transaction-processing.service.js';
import { AITransactionUpdateOrchestrator } from '../services/ai-transaction-update-orchestrator.service.js';
import { LLMConfig } from '../config/llm.config.js';
import { UserInputService } from '../services/user-input.service.js';
import { InteractiveTransactionUpdater } from '../services/interactive-transaction-updater.service.js';
import { ConfigManager } from '../config/config-manager.js';
import { AnalyzeDisplayService } from '../services/display/analyze-display.service.js';
import { SplitTransactionDisplayService } from '../services/display/split-transaction-display.service.js';
import { BillService } from '../services/core/bill.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';
import { TransactionSplitService } from '../services/transaction-split.service.js';
import { DisposableIncomeService } from '../services/disposable-income.service.js';
import { BudgetSurplusService } from '../services/budget-surplus.service.js';
import { DateRangeService } from '../services/core/date-range.service.js';
import { BudgetAnalyticsService } from '../services/budget-analytics.service.js';
import { BudgetInsightService } from '../services/budget-insight.service.js';
import { BudgetDisplayService } from '../services/display/budget-display.service.js';

export class ServiceFactory {
    static createServices(apiClient: FireflyClientWithCerts) {
        const config = ConfigManager.getInstance().getConfig();
        const dateRangeService = new DateRangeService();
        const budgetService = new BudgetService(apiClient, dateRangeService);
        const categoryService = new CategoryService(apiClient);
        const userInputService = new UserInputService(config.api.firefly.url);
        const excludedTransactionService = new ExcludedTransactionService(
            config.transactions.excludedTransactions
        );

        const accountScopeService = new AccountScopeService(apiClient, {
            incomeDestinationAccounts: config.accounts.incomeDestinationAccounts,
            expenseSourceAccounts: config.accounts.expenseSourceAccounts,
            untrackedAccounts: config.accounts.untrackedAccounts,
        });

        const transactionService = new TransactionService(
            excludedTransactionService,
            apiClient,
            dateRangeService
        );

        const transactionClassificationService = new TransactionClassificationService(
            config.transactions.tags.disposableIncome,
            config.transactions.tags.paycheck,
            config.accounts.paycheckDestinationAccounts
        );

        const transactionValidatorService = new TransactionValidatorService(
            transactionClassificationService
        );
        const additionalIncomeService = new AdditionalIncomeService(
            transactionService,
            transactionClassificationService,
            accountScopeService,
            config.transactions.excludedAdditionalIncomePatterns,
            config.transactions.excludeDisposableIncome
        );
        const unbudgetedExpenseService = new UnbudgetedExpenseService(
            transactionService,
            transactionClassificationService,
            accountScopeService,
            config.accounts.expenseTransfers
        );
        const budgetReport = new BudgetReportService(
            budgetService,
            transactionClassificationService,
            excludedTransactionService
        );
        const paycheckSurplusService = new PaycheckSurplusService(
            transactionService,
            transactionClassificationService,
            config.transactions.expectedMonthlyPaycheck
        );
        const analyzeDisplayService = new AnalyzeDisplayService(transactionClassificationService);
        const splitTransactionDisplayService = new SplitTransactionDisplayService(
            config.api.firefly.url
        );
        const billService = new BillService(apiClient, dateRangeService);
        const billComparisonService = new BillComparisonService(
            billService,
            transactionService,
            transactionClassificationService
        );
        const transactionSplitService = new TransactionSplitService(apiClient);
        const disposableIncomeService = new DisposableIncomeService(
            transactionService,
            transactionClassificationService
        );
        const budgetSurplusService = new BudgetSurplusService(budgetService);
        const budgetAnalyticsService = new BudgetAnalyticsService(
            budgetReport,
            budgetService,
            transactionService,
            transactionClassificationService
        );
        const budgetInsightService = new BudgetInsightService();
        const budgetDisplayService = new BudgetDisplayService(config.api.firefly.url);

        return {
            transactionService,
            budgetService,
            categoryService,
            userInputService,
            additionalIncomeService,
            unbudgetedExpenseService,
            budgetReport,
            transactionClassificationService,
            excludedTransactionService,
            paycheckSurplusService,
            transactionValidatorService,
            analyzeDisplayService,
            splitTransactionDisplayService,
            billService,
            billComparisonService,
            transactionSplitService,
            disposableIncomeService,
            budgetSurplusService,
            budgetAnalyticsService,
            budgetInsightService,
            budgetDisplayService,
        };
    }

    static async createAITransactionUpdateOrchestrator(
        services: ReturnType<typeof ServiceFactory.createServices>,
        force: boolean = false,
        dryRun: boolean = false
    ): Promise<AITransactionUpdateOrchestrator> {
        const claudeClient = LLMConfig.createClient();

        const llmConfig = ConfigManager.getInstance().getConfig().llm;
        const llmAssignmentService = new LLMAssignmentService(claudeClient, {
            batchSize: llmConfig.batchSize,
            maxConcurrent: llmConfig.maxConcurrent,
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
            dryRun,
            force
        );

        return new AITransactionUpdateOrchestrator(
            services.transactionService,
            interactiveTransactionUpdater,
            services.categoryService,
            services.budgetService,
            llmProcessingService,
            services.transactionValidatorService,
            force,
            dryRun
        );
    }
}
