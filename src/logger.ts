import { ConfigManager } from './config/config-manager.js';
import pino from 'pino';

/**
 * Get the configured logging level, with fallback to 'info' if config unavailable
 * This defers ConfigManager initialization to avoid errors at module import time
 */
const getLoggingLevel = (): string => {
    try {
        return ConfigManager.getInstance().getConfig().logging.level;
    } catch {
        // If ConfigManager initialization fails (e.g., missing .env),
        // use default log level. The error will be properly handled by the CLI.
        return 'info';
    }
};

export const logger = pino({
    level: getLoggingLevel(),
    formatters: {
        level: label => {
            return { level: label };
        },
    },
    timestamp: false,
    messageKey: 'message',
    base: null,
});
