import { Command, Option } from "commander";
import { AccountService } from "./services/account.service";
import { getAccounts } from "./commands/getAccounts";
import { FireflyApiClient, ApiClientConfig } from "./api/client";
import { UnbudgetedExpenseService } from "./services/unbudgeted-expense.service";
import { getUnbudgetedExpenses } from "./commands/getUnbudgetedExpenses";
import { config } from "./config";
import { TransactionService } from "./services/transaction.service";
import { AdditionalIncomeService } from "./services/additional-income.service";
import { getAdditionalIncome } from "./commands/getAdditionalIncome";

export const createCli = (): Command => {
  const program = new Command();

  const apiClient = new FireflyApiClient(config);

  const accountService = new AccountService(apiClient);
  const transactionService = new TransactionService(apiClient);
  const additionalIncomeService = new AdditionalIncomeService(transactionService);
  const unbudgetedExpenseService = new UnbudgetedExpenseService(
    transactionService
  );

  program
    .name("firefly-cli")
    .description("CLI to interact with Firefly III API")
    .version("1.0.0");

  program
    .command("get-accounts")
    .description("Get all accounts")
    .action(() => getAccounts(accountService));

  program
    .command("get-unbudgeted")
    .description("Get all unbudgeted expenses")
    .addOption(
      new Option("-m, --month <month>", "a month must be specified <int>")
        .argParser(parseInt)
        .makeOptionMandatory()
    )
    .action((opts) =>
      getUnbudgetedExpenses(unbudgetedExpenseService, opts.month)
    );

  program
    .command("get-additional")
    .description("Get all additional income")
    .addOption(
      new Option("-m, --month <month>", "a month must be specified <int>")
        .argParser(parseInt)
        .makeOptionMandatory()
    )
    .action((opts) =>
      getAdditionalIncome(additionalIncomeService, opts.month)
    );

  return program;
};
