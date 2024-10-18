import { Command } from "commander";
import { AccountService } from "./services/accountService";
import { getAccounts } from "./commands/getAccounts";
import { FireflyApiClient, ApiClientConfig } from "./api/client";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

export const createCli = (): Command => {
  const program = new Command();

  const config: ApiClientConfig = {
    baseUrl:
      process.env.FIREFLY_API_URL || "https://your-firefly-instance.com/api/v1",
    apiToken: process.env.FIREFLY_API_TOKEN || "",
    caCertPath: path.resolve(__dirname, "../certs/ca.pem"),
    clientCertPath: path.resolve(__dirname, "../certs/client.p12"),
    clientCertPassword: process.env.CLIENT_CERT_PASSWORD,
    rejectUnauthorized: false
  };

  const apiClient = new FireflyApiClient(config);

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
