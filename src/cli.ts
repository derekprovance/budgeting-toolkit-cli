import { Command } from "commander";
import { FireflyApiClient } from "./api/client";
import { AccountService } from "./services/accountService";
import { getAccounts } from "./commands/getAccounts";

export const createCli = (): Command => {
  const program = new Command();
  const apiClient = new FireflyApiClient();
  const accountService = new AccountService(apiClient);

  program
    .name("firefly-cli")
    .description("CLI to interact with Firefly III API")
    .version("1.0.0");

  program
    .command("get-accounts")
    .description("Get all accounts")
    .action(() => getAccounts(accountService));

  return program;
};
