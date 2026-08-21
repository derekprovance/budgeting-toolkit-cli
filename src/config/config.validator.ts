import { AppConfig, LOG_LEVELS } from './config.types.js';
import { Result, ValidationError } from '../types/result.type.js';
import { CertificateValidator } from '../utils/certificate-validator.js';

/**
 * Validates application configuration format at startup.
 *
 * Performs format and type validation:
 * - Valid URL formats
 * - Numeric ranges (positive LLM batch/rate-limit values)
 * - Enum values (log levels)
 * - File path existence (for certificates)
 *
 * Business logic validation (e.g., required fields) is performed by commands.
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
        const warnings: string[] = [];
        const missingEnvVars: string[] = [];

        // API Configuration Validation
        this.validateFireflyApi(config, errors, missingEnvVars);

        // Logging Configuration Validation
        this.validateLoggingConfig(config, errors);

        // LLM Configuration Validation (zero/negative values cause hangs)
        this.validateLlmConfig(config, errors);

        // Certificate Configuration Validation (optional but if present, must be valid)
        this.validateCertificates(config, errors, warnings);

        // Display warnings if any (non-blocking)
        if (warnings.length > 0) {
            console.warn('\n⚠️  Certificate Warnings:');
            warnings.forEach(warning => console.warn(`  ${warning}\n`));
        }

        if (errors.length > 0) {
            return {
                ok: false,
                error: {
                    field: 'configuration',
                    message: 'Configuration validation failed',
                    userMessage:
                        'Invalid configuration detected. Please check your .env and YAML config files.',
                    details: { errors, missingEnvVars },
                },
            };
        }

        return { ok: true, value: undefined };
    }

    private validateFireflyApi(
        config: AppConfig,
        errors: string[],
        missingEnvVars: string[]
    ): void {
        if (!config.api.firefly.url) {
            errors.push('FIREFLY_API_URL is required');
            missingEnvVars.push('FIREFLY_API_URL');
        } else if (!this.isValidUrl(config.api.firefly.url)) {
            errors.push('FIREFLY_API_URL must be a valid URL');
        }

        if (!config.api.firefly.token) {
            errors.push('FIREFLY_API_TOKEN is required');
            missingEnvVars.push('FIREFLY_API_TOKEN');
        }
    }

    /**
     * Validates LLM numeric configuration. Zero or negative values for batch
     * size, concurrency, or rate limiting cause infinite loops at runtime, so
     * they must be rejected at startup.
     */
    private validateLlmConfig(config: AppConfig, errors: string[]): void {
        const positiveIntegers: Array<[string, number]> = [
            ['llm.maxTokens', config.llm.maxTokens],
            ['llm.batchSize', config.llm.batchSize],
            ['llm.maxConcurrent', config.llm.maxConcurrent],
            ['llm.rateLimit.maxTokensPerMinute', config.llm.rateLimit.maxTokensPerMinute],
            ['llm.circuitBreaker.failureThreshold', config.llm.circuitBreaker.failureThreshold],
        ];
        for (const [key, value] of positiveIntegers) {
            if (!Number.isInteger(value) || value < 1) {
                errors.push(`${key} must be a positive integer (got: ${value})`);
            }
        }

        const positiveNumbers: Array<[string, number]> = [
            ['llm.rateLimit.refillInterval', config.llm.rateLimit.refillInterval],
            ['llm.circuitBreaker.resetTimeout', config.llm.circuitBreaker.resetTimeout],
        ];
        for (const [key, value] of positiveNumbers) {
            if (!Number.isFinite(value) || value <= 0) {
                errors.push(`${key} must be a positive number (got: ${value})`);
            }
        }

        if (typeof config.llm.model !== 'string' || !config.llm.model.trim()) {
            errors.push('llm.model must be a non-empty string');
        }
    }

    private validateLoggingConfig(config: AppConfig, errors: string[]): void {
        if (!LOG_LEVELS.includes(config.logging.level)) {
            errors.push(`logging.level must be one of: ${LOG_LEVELS.join(', ')}`);
        }
    }

    private validateCertificates(config: AppConfig, errors: string[], warnings: string[]): void {
        const certs = config.api.firefly.certificates;

        // Certificates are optional — validate whichever (client and/or CA) is configured
        if (!certs?.clientCertPath && !certs?.caCertPath) {
            return;
        }

        const validator = new CertificateValidator();

        // Validate client certificate (with password if provided)
        if (certs.clientCertPath) {
            const clientResult = validator.validateCertificate(
                certs.clientCertPath,
                'client',
                certs.clientCertPassword
            );
            errors.push(...clientResult.errors);
            warnings.push(...clientResult.warnings);
        }

        // Validate CA certificate if provided
        if (certs.caCertPath) {
            const caResult = validator.validateCertificate(certs.caCertPath, 'ca');
            errors.push(...caResult.errors);
            warnings.push(...caResult.warnings);
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
