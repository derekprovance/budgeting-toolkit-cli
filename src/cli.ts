import { Command, Option } from "commander";
import { FireflyApiClient } from "./api/client";
import { UnbudgetedExpenseService } from "./services/unbudgeted-expense.service";
import { calculateUnbudgetedExpenses } from "./commands/calculateUnbudgetedExpenses";
import { config } from "./config";
import { TransactionService } from "./services/transaction.service";
import { AdditionalIncomeService } from "./services/additional-income.service";
import { calculateAdditionalIncome } from "./commands/calculateAdditionalIncome";

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

  return program;
};
