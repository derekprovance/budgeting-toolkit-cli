import path from 'path';
import { existsSync } from 'fs';
import dotenv from 'dotenv';
import { getConfigValue } from './utils/config-loader';
import { FireflyClientWithCertsConfig } from './api/firefly-client-with-certs';

dotenv.config({
    quiet: true,
});

/**
 * Resolves certificate paths correctly for both development and production.
 * - Absolute paths are used as-is
 * - Relative paths are resolved from project root, not from dist/
 */
function resolveCertPath(envPath: string | undefined): string | undefined {
    if (!envPath) {
        return undefined;
    }

    // If absolute path, use as-is
    if (path.isAbsolute(envPath)) {
        return envPath;
    }

    // Relative paths resolve from project root (parent of dist/)
    const projectRoot = path.resolve(__dirname, '..');
    return path.resolve(projectRoot, envPath);
}

export const baseUrl: string = process.env.FIREFLY_API_URL || '';

export const config: FireflyClientWithCertsConfig = {
    BASE:
        (process.env.FIREFLY_API_URL?.trim() || 'https://your-firefly-instance.com') + '/api',
    TOKEN: process.env.FIREFLY_API_TOKEN || '',
    caCertPath: resolveCertPath(process.env.CLIENT_CERT_CA_PATH),
    clientCertPath: resolveCertPath(process.env.CLIENT_CERT_PATH),
    clientCertPassword: process.env.CLIENT_CERT_PASSWORD,
};

/**
 * Validates that certificate files exist if certificate authentication is configured.
 * Throws descriptive errors to help with configuration issues at startup.
 */
export function validateCertificateConfig(config: FireflyClientWithCertsConfig): void {
    if (!config.clientCertPath) {
        return; // Certificates are optional
    }

    const errors: string[] = [];

    if (!existsSync(config.clientCertPath)) {
        errors.push(`Client certificate not found: ${config.clientCertPath}`);
    }

    if (config.caCertPath && !existsSync(config.caCertPath)) {
        errors.push(`CA certificate not found: ${config.caCertPath}`);
    }

    if (errors.length > 0) {
        throw new Error(
            'Certificate configuration error:\n' + errors.map(e => `  - ${e}`).join('\n')
        );
    }
}

export const logLevel: string = process.env.LOG_LEVEL || 'silent';

export const claudeAPIKey = process.env.ANTHROPIC_API_KEY;

export const expectedMonthlyPaycheck = getConfigValue<number>(
    'expectedMonthlyPaycheck',
    'EXPECTED_MONTHLY_PAYCHECK'
);

//TODO(DEREK) - this needs to be migrated to the yaml configuration
export enum Tag {
    DISPOSABLE_INCOME = 'Disposable Income',
    BILLS = 'Bills',
}
