import { logLevel } from "./config";

import pino from "pino";

export const logger = pino({
  level: logLevel,
});
