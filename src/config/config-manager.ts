import path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import dotenv from 'dotenv';
import { AppConfig } from './config.types.js';
import { DEFAULT_CONFIG } from './config.defaults.js';
import { ConfigValidator } from './config.validator.js';
import { ValidTransfer } from '../types/interface/valid-transfer.interface.js';

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
 * 1. YAML configuration file (budgeting-toolkit.config.yaml)
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
            config.api.firefly.url = process.env.FIREFLY_API_URL;
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

        // Firefly Configuration
        if (yamlConfig.firefly?.noNameExpenseAccountId) {
            config.api.firefly.noNameExpenseAccountId = yamlConfig.firefly.noNameExpenseAccountId;
        }

        // LLM Configuration
        if (yamlConfig.llm) {
            if (yamlConfig.llm.model !== undefined) {
                config.llm.model = yamlConfig.llm.model;
            }
            if (yamlConfig.llm.temperature !== undefined) {
                config.llm.temperature = yamlConfig.llm.temperature;
            }
            if (yamlConfig.llm.maxTokens !== undefined) {
                config.llm.maxTokens = yamlConfig.llm.maxTokens;
            }
            if (yamlConfig.llm.batchSize !== undefined) {
                config.llm.batchSize = yamlConfig.llm.batchSize;
            }
            if (yamlConfig.llm.maxConcurrent !== undefined) {
                config.llm.maxConcurrent = yamlConfig.llm.maxConcurrent;
            }
            if (yamlConfig.llm.retryDelayMs !== undefined) {
                config.llm.retryDelayMs = yamlConfig.llm.retryDelayMs;
            }
            if (yamlConfig.llm.maxRetryDelayMs !== undefined) {
                config.llm.maxRetryDelayMs = yamlConfig.llm.maxRetryDelayMs;
            }

            // Rate Limit Configuration
            if (yamlConfig.llm.rateLimit) {
                if (yamlConfig.llm.rateLimit.maxTokensPerMinute !== undefined) {
                    config.llm.rateLimit.maxTokensPerMinute =
                        yamlConfig.llm.rateLimit.maxTokensPerMinute;
                }
                if (yamlConfig.llm.rateLimit.refillInterval !== undefined) {
                    config.llm.rateLimit.refillInterval = yamlConfig.llm.rateLimit.refillInterval;
                }
            }

            // Circuit Breaker Configuration
            if (yamlConfig.llm.circuitBreaker) {
                if (yamlConfig.llm.circuitBreaker.failureThreshold !== undefined) {
                    config.llm.circuitBreaker.failureThreshold =
                        yamlConfig.llm.circuitBreaker.failureThreshold;
                }
                if (yamlConfig.llm.circuitBreaker.resetTimeout !== undefined) {
                    config.llm.circuitBreaker.resetTimeout =
                        yamlConfig.llm.circuitBreaker.resetTimeout;
                }
                if (yamlConfig.llm.circuitBreaker.halfOpenTimeout !== undefined) {
                    config.llm.circuitBreaker.halfOpenTimeout =
                        yamlConfig.llm.circuitBreaker.halfOpenTimeout;
                }
            }
        }
    }

    /**
     * Loads and parses the YAML configuration file
     */
    private loadYamlFile(): YamlConfig | null {
        const configPath = path.join(process.cwd(), 'budgeting-toolkit.config.yaml');

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
