import { Command, Option } from "commander";
import { FireflyApiClient } from "@derekprovance/firefly-iii-sdk";
import { config } from "./config";
import { FinalizeBudgetCommand } from "./commands/finalize-budget.command";
import { BudgetStatusCommand } from "./commands/budget-status.command";
import { UpdateTransactionsCommand } from "./commands/update-transaction.command";
import { ServiceFactory } from "./factories/service.factory";
import { LLMConfig } from "./config/llm.config";
import { BudgetDateOptions, UpdateTransactionOptions } from "./types/interface/command-options.interface";
import { UpdateTransactionMode } from "./types/enum/update-transaction-mode.enum";
import { logger } from "./logger";
import { LLMTransactionCategoryService } from "./services/ai/llm-transaction-category.service";
import { LLMTransactionBudgetService } from "./services/ai/llm-transaction-budget.service";
import { LLMTransactionProcessingService } from "./services/ai/llm-transaction-processing.service";
import { UpdateTransactionService } from "./services/update-transaction.service";

const getCurrentMonth = (): number => {
  return new Date().getMonth() + 1;
};

const getCurrentYear = (): number => {
  return new Date().getFullYear();
};

export const createCli = (): Command => {
  const program = new Command();
  const apiClient = new FireflyApiClient(config);
  const services = ServiceFactory.createServices(apiClient);

  program
    .name("budgeting-toolkit-cli")
    .description("CLI to perform budgeting operations with Firefly III API")
    .version("3.0.0");

  program
    .command("finalize-budget")
    .description("Runs calculations needed to finalize the budget")
    .addOption(
      new Option(
        "-m, --month <month>",
        "month to process (1-12, defaults to current month)"
      ).argParser(parseInt)
    )
    .option("-y, --year <year>", "year to process (default: current year)")
    .action(async (opts: BudgetDateOptions) => {
      try {
        const command = new FinalizeBudgetCommand(
          services.additionalIncomeService,
          services.unbudgetedExpenseService,
          services.transactionPropertyService
        );
        await command.execute({
          month: opts.month ?? getCurrentMonth(),
          year: opts.year ?? getCurrentYear(),
        });
      } catch (error) {
        logger.error("Error finalizing budget:", error);
        process.exit(1);
      }
    });

  program
    .command("budget-status")
    .description("Calculates the status of a budget")
    .addOption(
      new Option(
        "-m, --month <month>",
        "month to process (1-12, defaults to current month)"
      ).argParser(parseInt)
    )
    .option("-y, --year <year>", "year to process (default: current year)")
    .action(async (opts: BudgetDateOptions) => {
      try {
        const command = new BudgetStatusCommand(
          services.budgetStatus,
          services.transactionService
        );
        await command.execute({
          month: opts.month ?? getCurrentMonth(),
          year: opts.year ?? getCurrentYear(),
        });
      } catch (error) {
        logger.error(error, "Error getting budget status");
        process.exit(1);
      }
    });

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
    .action(async (tag: string, opts: UpdateTransactionOptions) => {
      try {
        const claudeClient = LLMConfig.createClient();
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
          services.transactionPropertyService,
          opts.includeClassified,
          opts.yes
        );

        const command = new UpdateTransactionsCommand(updateCategoryService);
        await command.execute({
          tag,
          updateMode: opts.mode,
        });
      } catch (error) {
        logger.error("Error updating transactions:", error);
        process.exit(1);
      }
    });

  return program;
};
