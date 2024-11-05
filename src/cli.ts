import { Command, Option } from "commander";
import { FireflyApiClient } from "./api/firefly.client";
import { UnbudgetedExpenseService } from "./services/unbudgeted-expense.service";
import { calculateUnbudgetedExpenses } from "./commands/calculate-unbudgeted-expenses.command";
import { config } from "./config";
import { TransactionService } from "./services/transaction.service";
import { AdditionalIncomeService } from "./services/additional-income.service";
import { calculateAdditionalIncome } from "./commands/calculate-additional-income.command";
import { updateDescriptions as updateTransactions } from "./commands/update-transaction.command";
import { CategoryService } from "./services/category.service";

export const createCli = (): Command => {
  const program = new Command();

  const apiClient = new FireflyApiClient(config);

  const transactionService = new TransactionService(apiClient);
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
    .version("1.0.0");

  program
    .command("calculate-unbudgeted")
    .description("Calculate unbudgeted expenses")
    .addOption(
      new Option("-m, --month <month>", "a month must be specified <int>")
        .argParser(parseInt)
        .makeOptionMandatory()
    )
    .action((opts) =>
      calculateUnbudgetedExpenses(unbudgetedExpenseService, opts.month)
    );

  program
    .command("calculate-additional")
    .description("Calculate the additional income")
    .addOption(
      new Option("-m, --month <month>", "a month must be specified <int>")
        .argParser(parseInt)
        .makeOptionMandatory()
    )
    .action((opts) =>
      calculateAdditionalIncome(additionalIncomeService, opts.month)
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
    .action((opts) => updateTransactions(transactionService, categoryService, opts.tag));

  return program;
};
