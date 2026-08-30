import pino from 'pino';

/**
 * Application logger.
 *
 * Initialized from LOG_LEVEL (default 'info') so importing this module never
 * constructs the ConfigManager singleton — config isn't resolved until the CLI
 * parses --config. Once configuration is loaded, `createCli` applies the
 * configured level via `logger.level = config.logging.level`.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
        level: label => {
            return { level: label };
        },
    },
    timestamp: false,
    messageKey: 'message',
    base: null,
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
    },
});
