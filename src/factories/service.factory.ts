import { FireflyClientWithCerts } from '../api/firefly-client-with-certs.js';
import { TransactionService } from '../services/core/transaction.service.js';
import { BudgetService } from '../services/core/budget.service.js';
import { CategoryService } from '../services/core/category.service.js';
import { AdditionalIncomeService } from '../services/additional-income.service.js';
import { UnbudgetedExpenseService } from '../services/unbudgeted-expense.service.js';
import { BudgetReportService } from '../services/budget-report.service.js';
import { ExcludedTransactionService } from '../services/excluded-transaction.service.js';
import { TransactionClassificationService } from '../services/core/transaction-classification.service.js';
import { PaycheckSurplusService } from '../services/paycheck-surplus.service.js';
import { TransactionValidatorService } from '../services/core/transaction-validator.service.js';
import { TransactionAIResultValidator } from '../services/core/transaction-ai-result-validator.service.js';
import { LLMAssignmentService } from '../services/ai/llm-assignment.service.js';
import { LLMTransactionProcessingService } from '../services/ai/llm-transaction-processing.service.js';
import { AITransactionUpdateOrchestrator } from '../services/ai-transaction-update-orchestrator.service.js';
import { LLMConfig } from '../config/llm.config.js';
import { UserInputService } from '../services/user-input.service.js';
import { InteractiveTransactionUpdater } from '../services/interactive-transaction-updater.service.js';
import { config, baseUrl } from '../config.js';
import { BaseTransactionDisplayService } from '../services/display/base-transaction-display.service.js';
import { FinalizeBudgetDisplayService } from '../services/display/finalize-budget-display.service.js';
import { BudgetDisplayService } from '../services/display/budget-display.service.js';
import { BillService } from '../services/core/bill.service.js';
import { BillComparisonService } from '../services/bill-comparison.service.js';

export class ServiceFactory {
    static createServices(apiClient: FireflyClientWithCerts) {
        const transactionService = new TransactionService(apiClient);
        const budgetService = new BudgetService(apiClient);
        const categoryService = new CategoryService(apiClient);
        const userInputService = new UserInputService(baseUrl);
        const excludedTransactionService = new ExcludedTransactionService();
        const transactionClassificationService = new TransactionClassificationService(
            excludedTransactionService,
            config.api.firefly.noNameExpenseAccountId,
            config.transactions.tags.disposableIncome,
            config.transactions.tags.bills
        );
        const transactionValidatorService = new TransactionValidatorService(
            transactionClassificationService
        );
        const additionalIncomeService = new AdditionalIncomeService(
            transactionService,
            transactionClassificationService,
            config.accounts.validDestinationAccounts,
            config.transactions.excludedAdditionalIncomePatterns,
            config.transactions.excludeDisposableIncome
        );
        const unbudgetedExpenseService = new UnbudgetedExpenseService(
            transactionService,
            transactionClassificationService,
            config.accounts.validExpenseAccounts,
            config.accounts.validTransfers
        );
        const budgetReport = new BudgetReportService(
            budgetService,
            transactionClassificationService
        );
        const paycheckSurplusService = new PaycheckSurplusService(
            transactionService,
            transactionClassificationService,
            config.transactions.expectedMonthlyPaycheck
        );
        const baseTransactionDisplayService = new BaseTransactionDisplayService(
            transactionClassificationService
        );
        const finalizeBudgetDisplayService = new FinalizeBudgetDisplayService(
            baseTransactionDisplayService
        );
        const budgetDisplayService = new BudgetDisplayService(baseTransactionDisplayService);
        const billService = new BillService(apiClient);
        const billComparisonService = new BillComparisonService(billService, transactionService);

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
            baseTransactionDisplayService,
            finalizeBudgetDisplayService,
            budgetDisplayService,
            billService,
            billComparisonService,
        };
    }

    static async createAITransactionUpdateOrchestrator(
        apiClient: FireflyClientWithCerts,
        includeClassified: boolean = false,
        dryRun: boolean = false
    ): Promise<AITransactionUpdateOrchestrator> {
        const services = this.createServices(apiClient);
        const claudeClient = LLMConfig.createClient();

        const llmAssignmentService = new LLMAssignmentService(claudeClient);
        const llmProcessingService = new LLMTransactionProcessingService(llmAssignmentService);

        // Create AI validator service (will be initialized by orchestrator)
        const aiValidator = new TransactionAIResultValidator(
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
            aiValidator,
            llmProcessingService,
            services.transactionValidatorService,
            includeClassified
        );
    }
}
