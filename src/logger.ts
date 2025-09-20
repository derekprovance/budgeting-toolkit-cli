import { logLevel } from './config';

import pino from 'pino';

export const logger = pino({
    level: logLevel,
    formatters: {
        level: label => {
            return { level: label };
        },
    },
    timestamp: false,
    messageKey: 'message',
    base: null,
});
