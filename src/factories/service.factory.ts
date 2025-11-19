import { BudgetRead, CategoryProperties } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../api/firefly-client-with-certs';
import { TransactionService } from '../services/core/transaction.service';
import { BudgetService } from '../services/core/budget.service';
import { CategoryService } from '../services/core/category.service';
import { AdditionalIncomeService } from '../services/additional-income.service';
import { UnbudgetedExpenseService } from '../services/unbudgeted-expense.service';
import { BudgetReportService } from '../services/budget-report.service';
import { ExcludedTransactionService } from '../services/excluded-transaction.service';
import { TransactionClassificationService } from '../services/core/transaction-classification.service';
import { PaycheckSurplusService } from '../services/paycheck-surplus.service';
import { TransactionValidatorService } from '../services/core/transaction-validator.service';
import { LLMAssignmentService } from '../services/ai/llm-assignment.service';
import { LLMTransactionProcessingService } from '../services/ai/llm-transaction-processing.service';
import { UpdateTransactionService } from '../services/update-transaction.service';
import { LLMConfig } from '../config/llm.config';
import { UserInputService } from '../services/user-input.service';
import { TransactionUpdaterService } from '../services/transaction-updater.service';
import { baseUrl } from '../config';
import { DisplayService } from '../services/display/display.service';
import { FinalizeBudgetDisplayService } from '../services/display/finalize-budget-display.service';
import { BudgetDisplayService } from '../services/display/budget-display.service';
import { BillService } from '../services/core/bill.service';
import { BillComparisonService } from '../services/bill-comparison.service';

export class ServiceFactory {
    static createServices(apiClient: FireflyClientWithCerts) {
        const transactionService = new TransactionService(apiClient);
        const budgetService = new BudgetService(apiClient);
        const categoryService = new CategoryService(apiClient);
        const userInputService = new UserInputService(baseUrl);
        const excludedTransactionService = new ExcludedTransactionService();
        const transactionClassificationService = new TransactionClassificationService(
            excludedTransactionService
        );
        const transactionValidatorService = new TransactionValidatorService(
            transactionClassificationService
        );
        const additionalIncomeService = new AdditionalIncomeService(
            transactionService,
            transactionClassificationService
        );
        const unbudgetedExpenseService = new UnbudgetedExpenseService(
            transactionService,
            transactionClassificationService
        );
        const budgetReport = new BudgetReportService(budgetService, transactionClassificationService);
        const paycheckSurplusService = new PaycheckSurplusService(
            transactionService,
            transactionClassificationService
        );
        const displayService = new DisplayService(transactionClassificationService);
        const finalizeBudgetDisplayService = new FinalizeBudgetDisplayService(displayService);
        const budgetDisplayService = new BudgetDisplayService(displayService);
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
            displayService,
            finalizeBudgetDisplayService,
            budgetDisplayService,
            billService,
            billComparisonService,
        };
    }

    static async createUpdateTransactionService(
        apiClient: FireflyClientWithCerts,
        includeClassified: boolean = false,
        dryRun: boolean = false
    ): Promise<UpdateTransactionService> {
        const services = this.createServices(apiClient);
        const claudeClient = LLMConfig.createClient();

        const llmAssignmentService = new LLMAssignmentService(claudeClient);
        const llmProcessingService = new LLMTransactionProcessingService(
            llmAssignmentService
        );

        const budgets: BudgetRead[] = await services.budgetService.getBudgets();
        const categories: CategoryProperties[] = await services.categoryService.getCategories();

        const transactionUpdaterService = new TransactionUpdaterService(
            services.transactionService,
            services.transactionValidatorService,
            services.userInputService,
            dryRun,
            categories,
            budgets
        );

        return new UpdateTransactionService(
            services.transactionService,
            transactionUpdaterService,
            services.categoryService,
            services.budgetService,
            llmProcessingService,
            services.transactionValidatorService,
            includeClassified
        );
    }
}
