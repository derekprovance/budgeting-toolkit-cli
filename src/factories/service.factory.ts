import { FireflyApiClient } from "@derekprovance/firefly-iii-sdk";
import { TransactionService } from "../services/core/transaction.service";
import { BudgetService } from "../services/core/budget.service";
import { CategoryService } from "../services/core/category.service";
import { AdditionalIncomeService } from "../services/additional-income.service";
import { UnbudgetedExpenseService } from "../services/unbudgeted-expense.service";
import { BudgetStatusService } from "../services/budget-status.service";
import { ExcludedTransactionService } from "../services/excluded-transaction.service";
import { TransactionPropertyService } from "../services/core/transaction-property.service";
import { PaycheckSurplusService } from "../services/paycheck-surplus.service";
import { TransactionValidatorService } from "../services/core/transaction-validator.service";
import { LLMTransactionCategoryService } from "../services/ai/llm-transaction-category.service";
import { LLMTransactionBudgetService } from "../services/ai/llm-transaction-budget.service";
import { LLMTransactionProcessingService } from "../services/ai/llm-transaction-processing.service";
import { UpdateTransactionService } from "../services/update-transaction.service";
import { LLMConfig } from "../config/llm.config";

export class ServiceFactory {
    static createServices(apiClient: FireflyApiClient) {
        const transactionService = new TransactionService(apiClient);
        const budgetService = new BudgetService(apiClient);
        const categoryService = new CategoryService(apiClient);
        const excludedTransactionService = new ExcludedTransactionService();
        const transactionPropertyService = new TransactionPropertyService(
            excludedTransactionService,
        );
        const transactionValidatorService = new TransactionValidatorService(
            transactionPropertyService,
        );
        const additionalIncomeService = new AdditionalIncomeService(
            transactionService,
            transactionPropertyService,
        );
        const unbudgetedExpenseService = new UnbudgetedExpenseService(
            transactionService,
            transactionPropertyService,
        );
        const budgetStatus = new BudgetStatusService(budgetService);
        const paycheckSurplusService = new PaycheckSurplusService(
            transactionService,
            transactionPropertyService,
        );

        return {
            transactionService,
            budgetService,
            categoryService,
            additionalIncomeService,
            unbudgetedExpenseService,
            budgetStatus,
            transactionPropertyService,
            excludedTransactionService,
            paycheckSurplusService,
            transactionValidatorService,
        };
    }

    static createUpdateTransactionService(
        apiClient: FireflyApiClient,
        includeClassified: boolean = false,
        noConfirmation: boolean = false,
        dryRun: boolean = false,
    ): UpdateTransactionService {
        const services = this.createServices(apiClient);
        const claudeClient = LLMConfig.createClient();

        const llmCategoryService = new LLMTransactionCategoryService(
            claudeClient,
        );
        const llmBudgetService = new LLMTransactionBudgetService(claudeClient);
        const llmProcessingService = new LLMTransactionProcessingService(
            llmCategoryService,
            llmBudgetService,
        );

        return new UpdateTransactionService(
            services.transactionService,
            services.categoryService,
            services.budgetService,
            llmProcessingService,
            services.transactionValidatorService,
            includeClassified,
            noConfirmation,
            dryRun,
        );
    }
}
