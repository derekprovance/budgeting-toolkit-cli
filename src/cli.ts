import { Command, Option } from "commander";
import { FireflyApiClient } from "./api/firefly.client";
import { UnbudgetedExpenseService } from "./services/unbudgeted-expense.service";
import { claudeAPIKey, config, llmModel } from "./config";
import { TransactionService } from "./services/core/transaction.service";
import { AdditionalIncomeService } from "./services/additional-income.service";
import { updateTransactions as updateTransactions } from "./commands/update-transaction.command";
import { CategoryService } from "./services/core/category.service";
import { BudgetService } from "./services/core/budget.service";
import { ClaudeClient } from "./api/claude.client";
import { UpdateTransactionService } from "./services/update-transaction.service";
import { finalizeBudgetCommand } from "./commands/finalize-budget.command";
import { LLMTransactionCategoryService } from "./services/ai/llm-transaction-category.service";
import { LLMTransactionBudgetService } from "./services/ai/llm-transaction-budget.service";
import { LLMTransactionProcessingService } from "./services/ai/llm-transaction-processing.service";
import { UpdateTransactionMode } from "./types/enum/update-transaction-mode.enum";
import chalk from "chalk";

const getCurrentMonth = (): number => {
  return new Date().getMonth() + 1;
};

const getCurrentYear = (): number => {
  return new Date().getFullYear();
};

const initializeLLMClient = (): ClaudeClient => {
  if (!claudeAPIKey) {
    throw new Error(
      `${chalk.redBright('!!!')} Claude API Key is required to update transactions. Please check your .env file. ${chalk.redBright('!!!')}`
    );
  }

  return new ClaudeClient({
    apiKey: claudeAPIKey,
    model: llmModel,
    maxTokens: 20,
    maxRetries: 3,
    batchSize: 10,
    maxConcurrent: 5,
  });
};

interface UpdateTransactionOptions {
  tag: string;
  mode: UpdateTransactionMode;
  includeClassified?: boolean;
  yes?: boolean;
}

const initializeServices = (apiClient: FireflyApiClient) => {
  const transactionService = new TransactionService(apiClient);
  const budgetService = new BudgetService(apiClient);
  const categoryService = new CategoryService(apiClient);
  const additionalIncomeService = new AdditionalIncomeService(
    transactionService
  );
  const unbudgetedExpenseService = new UnbudgetedExpenseService(
    transactionService
  );

  return {
    transactionService,
    budgetService,
    categoryService,
    additionalIncomeService,
    unbudgetedExpenseService,
  };
};

export const createCli = (): Command => {
  const program = new Command();
  const apiClient = new FireflyApiClient(config);
  const services = initializeServices(apiClient);

  program
    .name("budgeting-toolkit-cli")
    .description("CLI to perform budgeting operations with Firefly III API")
    .version("2.2.5");

  program
    .command("finalize-budget")
    .description("Runs calculations needed to finalize the budget")
    .addOption(
      new Option(
        "-m, --month <month>",
        "month to process (1-12, defaults to current month)"
      )
        .argParser(parseInt)
    )
    .option(
      "-y, --year <year>",
      "year to process (default: current year)"
    )
    .action((opts) =>
      finalizeBudgetCommand(
        services.additionalIncomeService,
        services.unbudgetedExpenseService,
        opts.month ?? getCurrentMonth(),
        opts.year ?? getCurrentYear(),
      )
    );

  program
    .command("update-transactions <tag>")
    .description("Update transactions using an LLM")
    .addOption(
      new Option("-m, --mode <mode>", "mode to update transactions")
        .choices([
          UpdateTransactionMode.Category,
          UpdateTransactionMode.Budget,
          UpdateTransactionMode.Both,
        ])
        .default(UpdateTransactionMode.Both)
    )
    .option(
      "-i, --includeClassified",
      "include transactions that already have categories assigned (default: false)"
    )
    .option(
      "-y, --yes",
      "skip confirmation prompts and apply updates automatically (default: false)"
    )
    .action((tag: string,opts: UpdateTransactionOptions) => {
      try {
        const claudeClient = initializeLLMClient();
        const llmServices = {
          category: new LLMTransactionCategoryService(claudeClient),
          budget: new LLMTransactionBudgetService(claudeClient),
        };

        const llmTransactionProcessor = new LLMTransactionProcessingService(
          llmServices.category,
          llmServices.budget
        );

        const updateCategoryService = new UpdateTransactionService(
          services.transactionService,
          services.categoryService,
          services.budgetService,
          llmTransactionProcessor,
          opts.includeClassified,
          opts.yes
        );

        updateTransactions(updateCategoryService, tag, opts.mode);
      } catch (ex) {
        if (ex instanceof Error) {
          console.error(ex.message);
        }
      }
    });

  return program;
};
