/**
 * Main configuration export file.
 *
 * This file provides a clean interface to the application configuration
 * managed by ConfigManager. All configuration values should be accessed
 * through the ConfigManager singleton.
 *
 * For backward compatibility and convenience, this file exports commonly
 * used configuration values and types.
 */

import { ConfigManager } from './config/config-manager.js';

// Get configuration from the singleton manager
const config = ConfigManager.getInstance().getConfig();

// Export complete configuration for services that need it
export { config };

// Export commonly used configuration values for convenience
export const baseUrl = config.api.firefly.url;
export const claudeAPIKey = config.api.claude.apiKey;
export const logLevel = config.logging.level;
export const expectedMonthlyPaycheck = config.transactions.expectedMonthlyPaycheck;

// Re-export types
export * from './config/config.types.js';
export { ConfigManager } from './config/config-manager.js';

/**
 * Transaction Tags enum (for backward compatibility)
 */
export enum Tag {
    DISPOSABLE_INCOME = 'Disposable Income',
    BILLS = 'Bills',
}
