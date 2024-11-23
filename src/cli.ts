import { Command, Option } from "commander";
import { FireflyApiClient } from "./api/firefly.client";
import { UnbudgetedExpenseService } from "./services/unbudgeted-expense.service";
import { calculateUnbudgetedExpenses } from "./commands/calculate-unbudgeted-expenses.command";
import { claudeAPIKey, config, llmModel } from "./config";
import { TransactionService } from "./services/core/transaction.service";
import { AdditionalIncomeService } from "./services/additional-income.service";
import { calculateAdditionalIncome } from "./commands/calculate-additional-income.command";
import { updateTransactions as updateTransactions } from "./commands/update-transaction.command";
import { CategoryService } from "./services/core/category.service";
import { BudgetService } from "./services/core/budget.service";
import { ClaudeClient } from "./api/claude.client";
import { AIService } from "./services/ai/ai.service";
import { UpdateTransactionService } from "./services/update-transaction.service";

export const createCli = (): Command => {
  const program = new Command();

  const apiClient = new FireflyApiClient(config);

  const transactionService = new TransactionService(apiClient);
  const budgetService = new BudgetService(apiClient);
  const additionalIncomeService = new AdditionalIncomeService(
    transactionService
  );
  const unbudgetedExpenseService = new UnbudgetedExpenseService(
    transactionService
  );
  const categoryService = new CategoryService(apiClient);

  program
    .name("budgeting-toolkit-cli")
    .description("CLI to perform budgeting operations with Firefly III API")
    .version("1.5.1");

  program
    .command("calculate-unbudgeted")
    .description("Calculate unbudgeted expenses")
    .addOption(
      new Option(
        "-m, --month <month>",
        "month to run calculations <int>"
      ).argParser(parseInt)
    )
    .action((opts) =>
      calculateUnbudgetedExpenses(
        unbudgetedExpenseService,
        opts.month ?? getCurrentMonth()
      )
    );

  program
    .command("calculate-additional")
    .description("Calculate the additional income")
    .addOption(
      new Option(
        "-m, --month <month>",
        "month to run calculations <int>"
      ).argParser(parseInt)
    )
    .action((opts) =>
      calculateAdditionalIncome(
        additionalIncomeService,
        opts.month ?? getCurrentMonth()
      )
    );

  program
    .command("update-transactions")
    .description("Update transactions using an LLM")
    .addOption(
      new Option(
        "-t, --tag <tag>",
        "a tag must be specified <string>"
      ).makeOptionMandatory()
    )
    .option("-b, --budget", "update the budget for transactions")
    .action((opts) => {
      if (!claudeAPIKey) {
        console.log(
          "!!! Claude API Key is required to update transactions. Please check your .env file. !!!"
        );
        return;
      }

      const claudeClient = new ClaudeClient({
        apiKey: claudeAPIKey,
        model: llmModel,
        maxTokens: 20,
        maxRetries: 3,
        batchSize: 10,
        maxConcurrent: 5,
      });
      const aiService = new AIService(claudeClient);
      const updateCategoryService = new UpdateTransactionService(
        transactionService,
        categoryService,
        budgetService,
        aiService
      );

      updateTransactions(updateCategoryService, opts.tag, opts.budget);
    });

  const getCurrentMonth = (): number => {
    return new Date().getMonth();
  };

  return program;
};
