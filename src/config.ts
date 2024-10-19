import path from "path";
import { ApiClientConfig } from "./api/client";
import dotenv from "dotenv";

dotenv.config();

export const config: ApiClientConfig = {
  baseUrl:
    process.env.FIREFLY_API_URL || "https://your-firefly-instance.com/api/v1",
  apiToken: process.env.FIREFLY_API_TOKEN || "",
  caCertPath: path.resolve(__dirname, "../certs/ca.pem"),
  clientCertPath: path.resolve(__dirname, "../certs/client.p12"),
  clientCertPassword: process.env.CLIENT_CERT_PASSWORD,
  rejectUnauthorized: false,
};

export const logLevel: string = process.env.LOG_LEVEL || "info";

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
}

export enum Category {
  BILLS_UTILITIES = "2",
}
