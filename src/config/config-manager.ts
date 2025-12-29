import path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import dotenv from 'dotenv';
import { AppConfig, ExcludedTransaction } from './config.types.js';
import { DEFAULT_CONFIG } from './config.defaults.js';
import { ConfigValidator } from './config.validator.js';
import { ValidTransfer } from '../types/common.types.js';

/**
 * YAML configuration file structure (maps to AppConfig)
 */
interface YamlConfig {
    validDestinationAccounts?: string[];
    validExpenseAccounts?: string[];
    validTransfers?: ValidTransfer[];
    disposableIncomeAccounts?: string[];
    excludedAdditionalIncomePatterns?: string[];
    excludeDisposableIncome?: boolean;
    expectedMonthlyPaycheck?: number;
    excludedTransactions?: ExcludedTransaction[];

    tags?: {
        disposableIncome?: string;
        paycheck?: string;
    };

    firefly?: {
        noNameExpenseAccountId?: string;
    };

    llm?: {
        maxTokens?: number;
        batchSize?: number;
        maxConcurrent?: number;
        temperature?: number;
        model?: string;
        retryDelayMs?: number;
        maxRetryDelayMs?: number;
        rateLimit?: {
            maxTokensPerMinute?: number;
            refillInterval?: number;
        };
        circuitBreaker?: {
            failureThreshold?: number;
            resetTimeout?: number;
            halfOpenTimeout?: number;
        };
    };
}

/**
 * Centralized Configuration Manager (Singleton)
 *
 * Provides a unified interface for all application configuration.
 *
 * Configuration loading priority (high to low):
 * 1. YAML configuration file (config.yaml)
 * 2. Environment variables (.env)
 * 3. Default values (config.defaults.ts)
 *
 * All configuration is loaded at startup and validated immediately.
 * Services receive configuration via dependency injection.
 */
export class ConfigManager {
    private static instance: ConfigManager | undefined;
    private static configFilePath: string | null = null;
    private config: AppConfig;
    private loadedEnvPath: string | null = null;

    private constructor(configPath?: string) {
        // Resolve config file path (searches multiple locations based on priority)
        ConfigManager.configFilePath = ConfigManager.resolveConfigPath(configPath);

        // Load .env file
        this.loadEnvironmentFile();

        // Build configuration with proper precedence
        this.config = this.loadConfiguration();

        // Validate configuration
        this.validateConfiguration();
    }

    /**
     * Gets the singleton ConfigManager instance
     * @param configPath Optional path to config file (only used on first initialization)
     */
    static getInstance(configPath?: string): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager(configPath);
        }
        return ConfigManager.instance;
    }

    /**
     * Gets the complete application configuration
     */
    getConfig(): AppConfig {
        return this.config;
    }

    /**
     * Gets the path to the loaded config.yaml file
     * @returns Absolute path to loaded config file or null if none was loaded
     */
    getLoadedConfigPath(): string | null {
        return ConfigManager.configFilePath;
    }

    /**
     * Gets the path to the loaded .env file
     * @returns Absolute path to loaded .env file or null if none was loaded
     */
    getLoadedEnvPath(): string | null {
        return this.loadedEnvPath;
    }

    /**
     * Resets the singleton instance (for testing only)
     */
    static resetInstance(): void {
        ConfigManager.instance = undefined;
        ConfigManager.configFilePath = null;
    }

    /**
     * Gets the default config directory path (~/.budgeting)
     * @returns Absolute path to ~/.budgeting directory
     */
    static getDefaultConfigDir(): string {
        return path.join(os.homedir(), '.budgeting');
    }

    /**
     * Gets the default config file path (~/.budgeting/config.yaml)
     * @returns Absolute path to default config.yaml
     */
    static getDefaultConfigPath(): string {
        return path.join(ConfigManager.getDefaultConfigDir(), 'config.yaml');
    }

    /**
     * Gets the default .env file path (~/.budgeting/.env)
     * @returns Absolute path to default .env
     */
    static getDefaultEnvPath(): string {
        return path.join(ConfigManager.getDefaultConfigDir(), '.env');
    }

    /**
     * Resolves the config file path by searching multiple locations in priority order:
     * 1. CLI flag --config path (if provided)
     * 2. Current working directory: ./config.yaml
     * 3. User home directory: ~/.budgeting/config.yaml
     * 4. null (use defaults if no config file found)
     *
     * @param customPath Optional custom path from CLI flag
     * @returns Path to config file or null if none found
     */
    private static resolveConfigPath(customPath?: string): string | null {
        // Priority 1: CLI flag --config path (highest priority)
        if (customPath) {
            const resolved = path.isAbsolute(customPath)
                ? customPath
                : path.resolve(process.cwd(), customPath);

            if (fs.existsSync(resolved)) {
                return resolved;
            }

            throw new Error(`Config file not found: ${resolved}`);
        }

        // Priority 2: Current working directory
        const cwdPath = path.join(process.cwd(), 'config.yaml');
        if (fs.existsSync(cwdPath)) {
            return cwdPath;
        }

        // Priority 3: User home directory ~/.budgeting/config.yaml
        const homePath = ConfigManager.getDefaultConfigPath();
        if (fs.existsSync(homePath)) {
            return homePath;
        }

        // Priority 4: No config file found (use defaults)
        console.warn(
            'No config.yaml found. Using defaults. Run "budgeting-toolkit init" to create configuration.'
        );
        return null;
    }

    /**
     * Loads the .env file into process.env from multiple possible locations:
     * 1. ENV_FILE environment variable (if set)
     * 2. Current working directory: ./.env
     * 3. User home directory: ~/.budgeting/.env
     *
     * Uses dotenv.config which silently ignores missing files (quiet: true)
     * Tracks which .env file was loaded in this.loadedEnvPath
     */
    private loadEnvironmentFile(): void {
        // Priority 1: ENV_FILE environment variable
        if (process.env.ENV_FILE) {
            dotenv.config({
                path: process.env.ENV_FILE,
                quiet: true,
            });
            this.loadedEnvPath = process.env.ENV_FILE;
            return;
        }

        // Priority 2: Current working directory
        const cwdEnv = path.join(process.cwd(), '.env');
        const cwdEnvExists = fs.existsSync(cwdEnv);
        if (cwdEnvExists) {
            dotenv.config({
                path: cwdEnv,
                quiet: true,
            });
            this.loadedEnvPath = cwdEnv;
            return;
        }

        // Priority 3: User home directory ~/.budgeting/.env
        const homeEnv = ConfigManager.getDefaultEnvPath();
        if (fs.existsSync(homeEnv)) {
            dotenv.config({
                path: homeEnv,
                quiet: true,
            });
            this.loadedEnvPath = homeEnv;
            return;
        }

        // Priority 4: Fallback to .env in current directory (will be silently ignored if not found)
        dotenv.config({
            path: '.env',
            quiet: true,
        });
        // loadedEnvPath remains null since this is a fallback that will be ignored anyway
    }

    /**
     * Loads configuration with proper precedence:
     * Defaults → Environment Variables → YAML
     */
    private loadConfiguration(): AppConfig {
        // Start with defaults (deep clone to avoid mutation)
        const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as AppConfig;

        // Apply environment variables (overrides defaults)
        this.applyEnvironmentVariables(config);

        // Apply YAML configuration (overrides environment)
        this.applyYamlConfiguration(config);

        return config;
    }

    /**
     * Applies environment variables to configuration
     */
    private applyEnvironmentVariables(config: AppConfig): void {
        // Firefly API Configuration
        if (process.env.FIREFLY_API_URL) {
            // Remove trailing slashes to prevent double-slash issues when appending paths
            config.api.firefly.url = process.env.FIREFLY_API_URL.replace(/\/+$/, '');
        }

        if (process.env.FIREFLY_API_TOKEN) {
            config.api.firefly.token = process.env.FIREFLY_API_TOKEN;
        }

        // Firefly Certificate Configuration
        if (process.env.CLIENT_CERT_PATH) {
            config.api.firefly.certificates = config.api.firefly.certificates || {};
            config.api.firefly.certificates.clientCertPath = this.resolveCertPath(
                process.env.CLIENT_CERT_PATH
            );
        }

        if (process.env.CLIENT_CERT_CA_PATH) {
            config.api.firefly.certificates = config.api.firefly.certificates || {};
            config.api.firefly.certificates.caCertPath = this.resolveCertPath(
                process.env.CLIENT_CERT_CA_PATH
            );
        }

        if (process.env.CLIENT_CERT_PASSWORD) {
            config.api.firefly.certificates = config.api.firefly.certificates || {};
            config.api.firefly.certificates.clientCertPassword = process.env.CLIENT_CERT_PASSWORD;
        }

        // Claude API Configuration
        if (process.env.ANTHROPIC_API_KEY) {
            config.api.claude.apiKey = process.env.ANTHROPIC_API_KEY;
        }

        // Logging Configuration
        if (process.env.LOG_LEVEL) {
            config.logging.level = process.env.LOG_LEVEL as AppConfig['logging']['level'];
        }
    }

    /**
     * Applies YAML configuration to the config object
     */
    private applyYamlConfiguration(config: AppConfig): void {
        const yamlConfig = this.loadYamlFile();

        if (!yamlConfig) {
            return; // No YAML file or empty file
        }

        // Accounts Configuration
        if (yamlConfig.validDestinationAccounts) {
            config.accounts.validDestinationAccounts = yamlConfig.validDestinationAccounts;
        }
        if (yamlConfig.validExpenseAccounts) {
            config.accounts.validExpenseAccounts = yamlConfig.validExpenseAccounts;
        }
        if (yamlConfig.validTransfers) {
            config.accounts.validTransfers = yamlConfig.validTransfers;
        }
        if (yamlConfig.disposableIncomeAccounts) {
            config.accounts.disposableIncomeAccounts = yamlConfig.disposableIncomeAccounts;
        }

        // Transaction Configuration
        if (yamlConfig.excludedAdditionalIncomePatterns) {
            config.transactions.excludedAdditionalIncomePatterns =
                yamlConfig.excludedAdditionalIncomePatterns;
        }
        if (yamlConfig.excludeDisposableIncome !== undefined) {
            config.transactions.excludeDisposableIncome = yamlConfig.excludeDisposableIncome;
        }
        if (yamlConfig.expectedMonthlyPaycheck !== undefined) {
            config.transactions.expectedMonthlyPaycheck = yamlConfig.expectedMonthlyPaycheck;
        }
        if (yamlConfig.excludedTransactions) {
            config.transactions.excludedTransactions = yamlConfig.excludedTransactions;
        }

        // Tags Configuration
        if (yamlConfig.tags) {
            if (yamlConfig.tags.disposableIncome !== undefined) {
                config.transactions.tags.disposableIncome = yamlConfig.tags.disposableIncome;
            }
            if (yamlConfig.tags.paycheck !== undefined) {
                config.transactions.tags.paycheck = yamlConfig.tags.paycheck;
            }
        }

        // Firefly Configuration
        if (yamlConfig.firefly?.noNameExpenseAccountId) {
            config.api.firefly.noNameExpenseAccountId = yamlConfig.firefly.noNameExpenseAccountId;
        }

        // LLM Configuration - Use deep merge for nested structures
        if (yamlConfig.llm) {
            this.deepMerge(config.llm, yamlConfig.llm);
        }
    }

    /**
     * Deep merges source object into target, only overwriting defined values
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private deepMerge<T extends Record<string, any>>(
        target: T,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        source: any
    ): void {
        for (const [key, value] of Object.entries(source)) {
            if (value === undefined) {
                continue;
            }

            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                // Recursively merge nested objects
                if (target[key as keyof T] && typeof target[key as keyof T] === 'object') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    this.deepMerge(target[key as keyof T] as any, value);
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (target as any)[key] = value;
                }
            } else {
                // Direct assignment for primitives and arrays
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (target as any)[key] = value;
            }
        }
    }

    /**
     * Loads and parses the YAML configuration file
     */
    private loadYamlFile(): YamlConfig | null {
        // Use the resolved config path (may be null if no config file found)
        const configPath = ConfigManager.configFilePath;

        if (!configPath) {
            // No config file found - use defaults
            return null;
        }

        try {
            const fileContents = fs.readFileSync(configPath, 'utf8');
            return (yaml.load(fileContents) as YamlConfig) || null;
        } catch (error) {
            throw new Error(
                `Failed to parse YAML configuration at ${configPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Resolves certificate paths correctly for both development and production
     */
    private resolveCertPath(envPath: string): string {
        if (path.isAbsolute(envPath)) {
            return envPath;
        }

        // Resolve relative paths from project root
        const projectRoot = process.cwd();
        return path.resolve(projectRoot, envPath);
    }

    /**
     * Validates the configuration and throws if invalid
     */
    private validateConfiguration(): void {
        const validator = new ConfigValidator();
        const result = validator.validate(this.config);

        if (!result.ok) {
            const errors = (result.error.details?.errors as string[]) || [
                'Unknown validation error',
            ];
            const errorList = errors.join('\n  - ');
            throw new Error(`Configuration validation failed:\n  - ${errorList}`);
        }
    }
}
