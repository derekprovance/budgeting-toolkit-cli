import * as fs from 'fs';
import { Agent, AgentOptions } from 'https';
import { logger } from '../logger.js';
import axios, { AxiosInstance } from 'axios';
import { CertificateConfig } from '../config/config.types.js';

const REQUEST_TIMEOUT_MS = 30000;

/**
 * Creates an axios instance whose HTTPS agent presents the client certificate
 * and/or trusts the CA. ConfigValidator has already checked at startup that
 * the files exist and parse.
 *
 * @throws when a certificate file cannot be read; there is no fallback to
 *   plain axios, which would silently drop mTLS
 */
export function createCertificateAxios(config: CertificateConfig): AxiosInstance {
    logger.debug('Creating axios instance with certificate support');
    return axios.create({
        httpsAgent: new Agent({
            rejectUnauthorized: shouldRejectUnauthorized(config),
            ...(config.caCertPath && { ca: fs.readFileSync(config.caCertPath) }),
            ...(config.clientCertPath &&
                clientCertificateOptions(config.clientCertPath, config.clientCertPassword)),
        }),
        timeout: REQUEST_TIMEOUT_MS,
    });
}

function clientCertificateOptions(certPath: string, password?: string): AgentOptions {
    if (certPath.endsWith('.p12') || certPath.endsWith('.pfx')) {
        return { pfx: fs.readFileSync(certPath), ...(password && { passphrase: password }) };
    }

    // PEM: the key is expected beside the certificate, same name with .key
    const keyPath = certPath.replace(/\.(pem|crt)$/, '.key');
    return {
        cert: fs.readFileSync(certPath),
        ...(fs.existsSync(keyPath) && { key: fs.readFileSync(keyPath) }),
    };
}

/**
 * STRICT_TLS, when set, decides. Otherwise the chain is verified only when a
 * CA is configured: without one the server is most likely self-signed.
 */
function shouldRejectUnauthorized(config: CertificateConfig): boolean {
    if (process.env.STRICT_TLS !== undefined) {
        const rejectUnauthorized = process.env.STRICT_TLS !== 'false';
        logger.debug(
            `TLS validation ${rejectUnauthorized ? 'enabled' : 'disabled'} via STRICT_TLS=${process.env.STRICT_TLS}`
        );
        return rejectUnauthorized;
    }

    if (config.caCertPath) {
        logger.debug('TLS validation enabled (CA certificate provided)');
        return true;
    }

    logger.debug(
        'TLS validation disabled (no CA certificate provided). ' +
            'This is common for self-signed certificates. ' +
            'For production, provide CLIENT_CERT_CA_PATH or set STRICT_TLS=true.'
    );
    return false;
}
