import { logLevel } from "./config";

const pino = require("pino");

export const logger = pino({
  level: logLevel,
});
