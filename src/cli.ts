import { Command, Option } from "commander";
import { AccountService } from "./services/accountService";
import { getAccounts } from "./commands/getAccounts";
import { FireflyApiClient, ApiClientConfig } from "./api/client";
import { UnbudgetedExpenseService } from "./services/unbudgetedExpenseService";
import { getUnbudgetedExpenses } from "./commands/getUnbudgetedExpenses";
import { config } from "./config";

export const createCli = (): Command => {
  const program = new Command();

  const apiClient = new FireflyApiClient(config);

  const accountService = new AccountService(apiClient);
  const unbudgetedExpenseService = new UnbudgetedExpenseService(apiClient);

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
    .addOption(new Option('-m, --month <month>', 'a month must be specified <int>').argParser(parseInt).makeOptionMandatory())
    .action((opts) => getUnbudgetedExpenses(unbudgetedExpenseService, opts.month));

  return program;
};
