import path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
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
    excludedAdditionalIncomePatterns?: string[];
    excludeDisposableIncome?: boolean;
    expectedMonthlyPaycheck?: number;
    excludedTransactions?: ExcludedTransaction[];

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
    private config: AppConfig;

    private constructor() {
        // Load .env file
        this.loadEnvironmentFile();

        // Build configuration with proper precedence
        this.config = this.loadConfiguration();

        // Validate configuration
        this.validateConfiguration();
    }

    /**
     * Gets the singleton ConfigManager instance
     */
    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
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
     * Resets the singleton instance (for testing only)
     */
    static resetInstance(): void {
        ConfigManager.instance = undefined;
    }

    /**
     * Loads the .env file into process.env
     */
    private loadEnvironmentFile(): void {
        const envFile = process.env.ENV_FILE || '.env';
        dotenv.config({
            path: envFile,
            quiet: true,
        });
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
    private deepMerge<T extends Record<string, any>>(target: T, source: any): void {
        for (const [key, value] of Object.entries(source)) {
            if (value === undefined) {
                continue;
            }

            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                // Recursively merge nested objects
                if (target[key as keyof T] && typeof target[key as keyof T] === 'object') {
                    this.deepMerge(target[key as keyof T] as any, value);
                } else {
                    (target as any)[key] = value;
                }
            } else {
                // Direct assignment for primitives and arrays
                (target as any)[key] = value;
            }
        }
    }

    /**
     * Loads and parses the YAML configuration file
     */
    private loadYamlFile(): YamlConfig | null {
        const configPath = path.join(process.cwd(), 'config.yaml');

        if (!fs.existsSync(configPath)) {
            console.warn(`Configuration file not found at ${configPath}, using defaults`);
            return null;
        }

        try {
            const fileContents = fs.readFileSync(configPath, 'utf8');
            return (yaml.load(fileContents) as YamlConfig) || null;
        } catch (error) {
            throw new Error(`Failed to load YAML configuration: ${error}`);
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
