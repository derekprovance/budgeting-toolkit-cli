import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

export const API_BASE_URL =
  process.env.FIREFLY_API_URL || "https://your-firefly-instance.com/api/v1";
export const API_TOKEN = process.env.FIREFLY_API_TOKEN;

// Client certificate configuration
export const CLIENT_CERT_PATH =
  process.env.CLIENT_CERT_PATH || path.join(__dirname, "../certs/client.crt");
export const CLIENT_KEY_PATH =
  process.env.CLIENT_KEY_PATH || path.join(__dirname, "../certs/client.key");
export const CA_CERT_PATH =
  process.env.CA_CERT_PATH || path.join(__dirname, "../certs/ca.crt");

// Validate configuration
export function validateConfig() {
  if (!API_TOKEN) {
    console.error(
      "Error: FIREFLY_API_TOKEN is not set in the environment variables."
    );
    process.exit(1);
  }

  if (!fs.existsSync(CLIENT_CERT_PATH)) {
    console.error(`Error: Client certificate not found at ${CLIENT_CERT_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(CLIENT_KEY_PATH)) {
    console.error(`Error: Client key not found at ${CLIENT_KEY_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(CA_CERT_PATH)) {
    console.error(`Error: CA certificate not found at ${CA_CERT_PATH}`);
    process.exit(1);
  }
}
