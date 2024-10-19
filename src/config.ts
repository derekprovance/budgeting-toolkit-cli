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
