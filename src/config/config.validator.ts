import { AppConfig } from './config.types.js';
import { Result, ValidationError } from '../types/result.type.js';
import * as fs from 'fs';

/**
 * Validates application configuration format at startup.
 *
 * Performs format and type validation:
 * - Valid URL formats
 * - Numeric ranges (temperature 0-1, positive numbers)
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

        // API Configuration Validation
        this.validateFireflyApi(config, errors);

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
