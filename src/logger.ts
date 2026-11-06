import pino from 'pino';

/**
 * Initialized from LOG_LEVEL so importing this module never constructs ConfigManager, which
 * needs --config; the CLI applies the configured level once config is loaded.
 *
 * Writes to stderr: a diagnostic line on stdout would corrupt `--json` output.
 */
export const logger = pino(
    {
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
    },
    pino.destination(2)
);
