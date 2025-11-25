import { ConfigManager } from './config/config-manager.js';

import pino from 'pino';

export const logger = pino({
    level: ConfigManager.getInstance().getConfig().logging.level,
    formatters: {
        level: label => {
            return { level: label };
        },
    },
    timestamp: false,
    messageKey: 'message',
    base: null,
});
