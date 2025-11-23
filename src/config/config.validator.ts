import { AppConfig } from './config.types.js';
import { Result, ValidationError } from '../types/result.type.js';
import * as fs from 'fs';

/**
 * Validates application configuration at startup.
 *
 * Performs comprehensive validation including:
 * - Required fields presence
 * - Numeric range validation
 * - Enum value validation
 * - File path existence (for certificates)
 */
export class ConfigValidator {
    /**
     * Validates the complete application configuration
     *
     * @param config - The configuration to validate
     * @returns Result with void on success, ValidationError with all issues on failure
     */
    validate(config: AppConfig): Result<void, ValidationError> {
        const errors: string[] = [];

        // API Configuration Validation
        this.validateFireflyApi(config, errors);
        this.validateClaudeApi(config, errors);

        // LLM Configuration Validation
        this.validateLlmConfig(config, errors);

        // Logging Configuration Validation
        this.validateLoggingConfig(config, errors);

        // Certificate Configuration Validation (optional but if present, must be valid)
        this.validateCertificates(config, errors);

        if (errors.length > 0) {
            return {
                ok: false,
                error: {
                    field: 'configuration',
                    message: 'Configuration validation failed',
                    userMessage:
                        'Invalid configuration detected. Please check your .env and YAML config files.',
                    details: { errors },
                },
            };
        }

        return { ok: true, value: undefined };
    }

    private validateFireflyApi(config: AppConfig, errors: string[]): void {
        if (!config.api.firefly.url) {
            errors.push('FIREFLY_API_URL is required');
        } else if (!this.isValidUrl(config.api.firefly.url)) {
            errors.push('FIREFLY_API_URL must be a valid URL');
        }

        if (!config.api.firefly.token) {
            errors.push('FIREFLY_API_TOKEN is required');
        }

        if (!config.api.firefly.noNameExpenseAccountId) {
            errors.push('firefly.noNameExpenseAccountId is required');
        }
    }

    private validateClaudeApi(config: AppConfig, errors: string[]): void {
        if (!config.api.claude.apiKey) {
            errors.push('ANTHROPIC_API_KEY is required');
        }

        if (!config.api.claude.baseURL) {
            errors.push('claude.baseURL is required');
        } else if (!this.isValidUrl(config.api.claude.baseURL)) {
            errors.push('claude.baseURL must be a valid URL');
        }

        if (config.api.claude.timeout < 1000) {
            errors.push('claude.timeout must be at least 1000ms');
        }

        if (config.api.claude.maxRetries < 0) {
            errors.push('claude.maxRetries must be non-negative');
        }
    }

    private validateLlmConfig(config: AppConfig, errors: string[]): void {
        // Temperature validation (0-1 range for Claude)
        if (config.llm.temperature < 0 || config.llm.temperature > 1) {
            errors.push('llm.temperature must be between 0 and 1');
        }

        // Token limits
        if (config.llm.maxTokens < 1) {
            errors.push('llm.maxTokens must be at least 1');
        }

        // Batch configuration
        if (config.llm.batchSize < 1) {
            errors.push('llm.batchSize must be at least 1');
        }

        if (config.llm.maxConcurrent < 1) {
            errors.push('llm.maxConcurrent must be at least 1');
        }

        // Retry configuration
        if (config.llm.retryDelayMs < 0) {
            errors.push('llm.retryDelayMs must be non-negative');
        }

        if (config.llm.maxRetryDelayMs < config.llm.retryDelayMs) {
            errors.push('llm.maxRetryDelayMs must be >= llm.retryDelayMs');
        }

        // Rate limit configuration
        if (config.llm.rateLimit.maxTokensPerMinute < 1) {
            errors.push('llm.rateLimit.maxTokensPerMinute must be at least 1');
        }

        if (config.llm.rateLimit.refillInterval < 1000) {
            errors.push('llm.rateLimit.refillInterval must be at least 1000ms');
        }

        // Circuit breaker configuration
        if (config.llm.circuitBreaker.failureThreshold < 1) {
            errors.push('llm.circuitBreaker.failureThreshold must be at least 1');
        }

        if (config.llm.circuitBreaker.resetTimeout < 1000) {
            errors.push('llm.circuitBreaker.resetTimeout must be at least 1000ms');
        }

        if (config.llm.circuitBreaker.halfOpenTimeout < 1000) {
            errors.push('llm.circuitBreaker.halfOpenTimeout must be at least 1000ms');
        }
    }

    private validateLoggingConfig(config: AppConfig, errors: string[]): void {
        const validLogLevels = ['trace', 'debug', 'info', 'warn', 'error', 'silent'];
        if (!validLogLevels.includes(config.logging.level)) {
            errors.push(`logging.level must be one of: ${validLogLevels.join(', ')}`);
        }
    }

    private validateCertificates(config: AppConfig, errors: string[]): void {
        const certs = config.api.firefly.certificates;

        // Certificates are optional, but if clientCertPath is specified, validate it
        if (!certs?.clientCertPath) {
            return;
        }

        if (!fs.existsSync(certs.clientCertPath)) {
            errors.push(`Client certificate not found: ${certs.clientCertPath}`);
        }

        if (certs.caCertPath && !fs.existsSync(certs.caCertPath)) {
            errors.push(`CA certificate not found: ${certs.caCertPath}`);
        }
    }

    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
}
