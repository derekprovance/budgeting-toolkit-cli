import path from "path";
import { ApiClientConfig } from "./api/firefly.client";
import dotenv from "dotenv";
import { MonthlyInvestment } from "./dto/monthly-investment.dto";

dotenv.config();

export const config: ApiClientConfig = {
  baseUrl:
    process.env.FIREFLY_API_URL || "https://your-firefly-instance.com/api/v1",
  apiToken: process.env.FIREFLY_API_TOKEN || "",
  caCertPath: process.env.CLIENT_CERT_CA_PATH
    ? path.resolve(__dirname, process.env.CLIENT_CERT_CA_PATH)
    : undefined,
  clientCertPath: process.env.CLIENT_CERT_PATH
    ? path.resolve(__dirname, process.env.CLIENT_CERT_PATH)
    : undefined,
  clientCertPassword: process.env.CLIENT_CERT_PASSWORD,
  rejectUnauthorized: false,
};

export const logLevel: string = process.env.LOG_LEVEL || "info";

export const claudeAPIKey = process.env.ANTHROPIC_API_KEY;
export const llmModel = process.env.LLM_MODEL;

export const monthlyInvestment = {
  description: process.env.MONTHLY_INVESTMENT_DESC,
  amount: process.env.MONTHLY_INVESTMENT_AMOUNT,
} as MonthlyInvestment;

export enum Account {
  PRIMARY = "1",
  DISPOSABLE = "13",
  SAVINGS = "2",
  MONEY_MARKET = "27",
  CHASE_AMAZON = "8",
  CHASE_SAPPHIRE = "11",
  CITIBANK_DOUBLECASH = "14",
}

export enum ExpenseAccount {
  NO_NAME = "5",
}

export enum Tag {
  DISPOSABLE_INCOME = "Disposable Income",
  BILLS = "Bills",
}

export enum Description {
  PAYROLL = "PAYROLL",
}
