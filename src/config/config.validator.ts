import { AppConfig, LOG_LEVELS } from './config.types.js';
import { validateCertificate } from '../utils/certificate-validator.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';

/** What a configuration check found. */
export interface ConfigValidationReport {
    /** Blocking: the configuration cannot be used */
    readonly problems: string[];
    /** The required environment variables that are unset (each also has a problem) */
    readonly missingEnvVars: string[];
    /** Non-blocking notes for the user, such as a certificate close to expiry */
    readonly warnings: string[];
}

/** Thrown by ConfigManager when the configuration has at least one problem. */
export class ConfigValidationError extends Error {
    readonly problems: string[];
    readonly missingEnvVars: string[];

    constructor(report: ConfigValidationReport) {
        super(`Configuration validation failed:\n  - ${report.problems.join('\n  - ')}`);
        this.name = 'ConfigValidationError';
        this.problems = report.problems;
        this.missingEnvVars = report.missingEnvVars;
    }
}

/** Command-specific requirements, such as the Claude API key, are validated by the commands. */
export class ConfigValidator {
    validate(config: AppConfig): ConfigValidationReport {
        const missingEnvVars = this.findMissingEnvVars(config);
        const certificates = this.checkCertificates(config);

        return {
            problems: [
                ...this.checkFireflyUrl(config),
                ...this.checkFireflyToken(config),
                ...this.checkLoggingConfig(config),
                ...this.checkLlmConfig(config),
                ...this.checkCategorizeConfig(config),
                ...this.checkExcludedTransactions(config),
                ...certificates.errors,
            ],
            missingEnvVars,
            warnings: certificates.warnings,
        };
    }

    private findMissingEnvVars(config: AppConfig): string[] {
        const required: Record<string, string> = {
            FIREFLY_API_URL: config.api.firefly.url,
            FIREFLY_API_TOKEN: config.api.firefly.token,
        };
        return Object.keys(required).filter(name => !required[name]);
    }

    private checkFireflyUrl(config: AppConfig): string[] {
        const { url } = config.api.firefly;
        if (!url) {
            return ['FIREFLY_API_URL is required'];
        }
        return this.isValidUrl(url) ? [] : ['FIREFLY_API_URL must be a valid URL'];
    }

    private checkFireflyToken(config: AppConfig): string[] {
        return config.api.firefly.token ? [] : ['FIREFLY_API_TOKEN is required'];
    }

    /** Zero or negative batch size, concurrency or rate limits loop forever at runtime. */
    private checkLlmConfig(config: AppConfig): string[] {
        const errors: string[] = [];
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
        return errors;
    }

    private checkCategorizeConfig(config: AppConfig): string[] {
        const months = config.categorize.historyMonths;
        return Number.isInteger(months) && months >= 0 && months <= 120
            ? []
            : [`categorize.historyMonths must be an integer from 0 to 120 (got: ${months})`];
    }

    /**
     * R-EXCL-1: a malformed rule would sit in the config matching nothing, or the wrong thing.
     * An amount-only rule would drop every transaction of that amount on every account.
     */
    private checkExcludedTransactions(config: AppConfig): string[] {
        if (!Array.isArray(config.transactions.excludedTransactions)) {
            return ['transactions.excludedTransactions must be a list'];
        }

        return config.transactions.excludedTransactions.flatMap((entry, index) => {
            const field = `transactions.excludedTransactions[${index}]`;
            const errors: string[] = [];

            if (typeof entry.description !== 'string' || !entry.description.trim()) {
                errors.push(
                    `${field}: 'description' is required (amount-only exclusions are not supported)`
                );
            }

            // Parsed with the same helper the matcher uses, so validation can
            // never accept an amount that matching would then reject
            if (
                entry.amount !== undefined &&
                TransactionCalculationUtils.parseAmount(entry.amount) === undefined
            ) {
                errors.push(`${field}.amount must be a valid amount (got: ${entry.amount})`);
            }
            return errors;
        });
    }

    private checkLoggingConfig(config: AppConfig): string[] {
        return LOG_LEVELS.includes(config.logging.level)
            ? []
            : [`logging.level must be one of: ${LOG_LEVELS.join(', ')}`];
    }

    private checkCertificates(config: AppConfig): { errors: string[]; warnings: string[] } {
        const certs = config.api.firefly.certificates;

        const results = [
            certs?.clientCertPath &&
                validateCertificate(certs.clientCertPath, 'client', certs.clientCertPassword),
            certs?.caCertPath && validateCertificate(certs.caCertPath, 'ca'),
        ].filter(result => !!result);

        return {
            errors: results.flatMap(result => result.errors),
            warnings: results.flatMap(result => result.warnings),
        };
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
