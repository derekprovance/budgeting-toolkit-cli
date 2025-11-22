import * as https from 'https';
import * as fs from 'fs';
import { Agent } from 'https';
import { logger } from '../logger.js';
import axios, { AxiosInstance } from 'axios';

export interface CertificateConfig {
    caCertPath?: string;
    clientCertPath?: string;
    clientCertPassword?: string;
}

/**
 * Creates a custom axios instance that supports client certificates
 * for HTTPS requests in Node.js environments.
 *
 * @param config Certificate configuration
 * @returns An axios instance with certificate support
 */
export function createCustomAxiosInstance(config: CertificateConfig): AxiosInstance {
    if (!config.clientCertPath) {
        logger.debug('No client certificate configured, using default axios');
        return axios.create();
    }

    try {
        // Validate certificate files exist
        if (config.caCertPath && !fs.existsSync(config.caCertPath)) {
            throw new Error(`CA certificate not found: ${config.caCertPath}`);
        }
        if (!fs.existsSync(config.clientCertPath)) {
            throw new Error(`Client certificate not found: ${config.clientCertPath}`);
        }

        // Determine TLS validation strategy:
        // 1. If STRICT_TLS env var is set, use that value (allows explicit override)
        // 2. If CA cert is provided, enable validation (we can verify the chain)
        // 3. If no CA cert, disable validation (likely self-signed scenario)
        let rejectUnauthorized: boolean;

        if (process.env.STRICT_TLS !== undefined) {
            // Explicit override via environment variable
            rejectUnauthorized = process.env.STRICT_TLS !== 'false';
            logger.debug(
                `TLS validation ${rejectUnauthorized ? 'enabled' : 'disabled'} via STRICT_TLS=${process.env.STRICT_TLS}`
            );
        } else if (config.caCertPath) {
            // CA certificate provided, we can validate the certificate chain
            rejectUnauthorized = true;
            logger.debug('TLS validation enabled (CA certificate provided)');
        } else {
            // No CA certificate, likely self-signed - disable validation
            rejectUnauthorized = false;
            logger.debug(
                'TLS validation disabled (no CA certificate provided). ' +
                    'This is common for self-signed certificates. ' +
                    'For production, provide CLIENT_CERT_CA_PATH or set STRICT_TLS=true.'
            );
        }

        const agentOptions: https.AgentOptions = {
            rejectUnauthorized,
        };

        if (config.caCertPath) {
            agentOptions.ca = fs.readFileSync(config.caCertPath);
        }

        // Handle P12/PFX format client certificates
        if (config.clientCertPath.endsWith('.p12') || config.clientCertPath.endsWith('.pfx')) {
            agentOptions.pfx = fs.readFileSync(config.clientCertPath);
            if (config.clientCertPassword) {
                agentOptions.passphrase = config.clientCertPassword;
            }
        } else {
            // Handle PEM format certificates
            agentOptions.cert = fs.readFileSync(config.clientCertPath);
            // Assume key file has same name with .key extension if not specified
            const keyPath = config.clientCertPath.replace(/\.(pem|crt)$/, '.key');
            if (fs.existsSync(keyPath)) {
                agentOptions.key = fs.readFileSync(keyPath);
            }
        }

        // Create and return axios instance with HTTPS agent
        logger.debug('Creating axios instance with client certificate support');
        return axios.create({
            httpsAgent: new Agent(agentOptions),
            timeout: 30000,
        });
    } catch (error) {
        logger.error({ error }, 'Failed to create custom axios instance with certificates');
        logger.warn('Falling back to default axios without client certificates');
        return axios.create();
    }
}
