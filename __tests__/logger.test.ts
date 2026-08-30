import { describe, it, expect } from '@jest/globals';

// Import order matters: logger first, exactly as cli.ts does via its imports
import { logger } from '../src/logger.js';
import { ConfigManager } from '../src/config/config-manager.js';

describe('logger', () => {
    it('should not construct the ConfigManager singleton at import time', () => {
        // If logger.ts called ConfigManager.getInstance() during module init,
        // the singleton would already exist here — and it would have been built
        // WITHOUT the --config path, silently breaking the flag.
        expect(ConfigManager.getResolvedPaths().configPath).toBeNull();
        expect(ConfigManager.getResolvedPaths().envPath).toBeNull();
    });

    it('should allow the level to be set after configuration loads', () => {
        const original = logger.level;
        try {
            logger.level = 'debug';
            expect(logger.level).toBe('debug');
        } finally {
            logger.level = original;
        }
    });
});
