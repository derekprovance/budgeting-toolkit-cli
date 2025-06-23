import { Command, Option } from "commander";
import { FireflyApiClient } from "@derekprovance/firefly-iii-sdk";
import { config } from "./config";
import { FinalizeBudgetCommand } from "./commands/finalize-budget.command";
import { BudgetStatusCommand } from "./commands/budget-status.command";
import { UpdateTransactionsCommand } from "./commands/update-transaction.command";
import { ServiceFactory } from "./factories/service.factory";
import {
  BudgetDateOptions,
  UpdateTransactionOptions,
} from "./types/interface/command-options.interface";
import { UpdateTransactionMode } from "./types/enum/update-transaction-mode.enum";
import { logger } from "./logger";

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
    .version("3.1.0");

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
          services.transactionPropertyService,
          services.paycheckSurplusService
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
    .option(
      "-d, --dryRun",
      "show proposed changes without applying them (default: false)"
    )
    .action(async (tag: string, opts: UpdateTransactionOptions) => {
      if (!tag || tag.trim() === "") {
        logger.error("Tag parameter is required and cannot be empty");
        process.exit(1);
      }

      try {
        const updateTransactionService = ServiceFactory.createUpdateTransactionService(
          apiClient,
          opts.includeClassified,
          opts.yes,
          opts.dryRun
        );

        const command = new UpdateTransactionsCommand(updateTransactionService);
        await command.execute({
          tag,
          updateMode: opts.mode,
          dryRun: opts.dryRun
        });
      } catch (error) {
        logger.error("Error updating transactions:", error);
        process.exit(1);
      }
    });

  return program;
};
