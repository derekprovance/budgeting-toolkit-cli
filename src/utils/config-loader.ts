import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ValidTransfer } from '../types/interface/valid-transfer.interface';

interface YamlConfig {
    validDestinationAccounts?: string[];
    validExpenseAccounts?: string[];
    validTransfers?: ValidTransfer[];
    excludedDescriptions?: string[];
    excludedTransactionsCsv?: string;
    excludeDisposableIncome?: boolean;
    minTransactionAmount?: number;
    expectedMonthlyPaycheck?: number;

    // Firefly Configuration
    firefly?: {
        noNameExpenseAccountId: string;
    };

    // LLM Configuration
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

let cachedConfig: YamlConfig | null = null;

/**
 * Clears the cached configuration (for testing purposes)
 */
export function clearConfigCache(): void {
    cachedConfig = null;
}

/**
 * Loads configuration from the budgeting-toolkit.config.yaml file
 */
export function loadYamlConfig(): YamlConfig {
    if (cachedConfig) {
        return cachedConfig;
    }

    const configPath = path.join(process.cwd(), 'budgeting-toolkit.config.yaml');

    try {
        if (!fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found at ${configPath}`);
        }

        const fileContents = fs.readFileSync(configPath, 'utf8');
        const config = yaml.load(fileContents) as YamlConfig;

        cachedConfig = config || {};
        return cachedConfig;
    } catch (error) {
        throw new Error(`Failed to load YAML configuration: ${error}`);
    }
}

/**
 * Gets a configuration value, with fallback to environment variable
 */
export function getConfigValue<T>(
    yamlKey: keyof YamlConfig,
    envKey?: string,
    defaultValue?: T
): T | undefined {
    const yamlConfig = loadYamlConfig();

    // First try YAML config
    if (yamlConfig[yamlKey] !== undefined) {
        return yamlConfig[yamlKey] as T;
    }

    // Then try environment variable
    if (envKey && process.env[envKey] !== undefined) {
        const envValue = process.env[envKey];

        // Try to parse as number if the YAML value would be a number
        if (typeof defaultValue === 'number' && envValue) {
            const parsed = parseFloat(envValue);
            if (!isNaN(parsed)) {
                return parsed as T;
            }
        }

        return envValue as T;
    }

    // Finally fall back to default
    return defaultValue;
}
