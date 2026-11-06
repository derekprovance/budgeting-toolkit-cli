import * as fs from 'fs';
import { X509Certificate } from 'crypto';
import { spawnSync } from 'child_process';
import { errorMessage } from './error-detection.utils.js';

export interface CertificateValidationResult {
    errors: string[];
    warnings: string[];
}

export type CertificateType = 'client' | 'ca';

const CERTIFICATE_LABELS: Record<CertificateType, string> = { client: 'Client', ca: 'CA' };

const EXPIRY_WARNING_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const MIN_P12_BYTES = 100;
/** A PKCS#12 file is a DER SEQUENCE, which starts with this byte */
const DER_SEQUENCE_TAG = 0x30;

const passed = (): CertificateValidationResult => ({ errors: [], warnings: [] });
const failed = (error: string): CertificateValidationResult => ({ errors: [error], warnings: [] });

/** The format is chosen by extension; only a PEM's validity period is checked. */
export function validateCertificate(
    certPath: string,
    certType: CertificateType,
    certPassword?: string
): CertificateValidationResult {
    const label = `${CERTIFICATE_LABELS[certType]} certificate`;

    const accessError = checkFileAccess(certPath, label);
    if (accessError) {
        return failed(accessError);
    }

    if (isP12Certificate(certPath)) {
        const p12Error = validateP12Certificate(certPath, label, certPassword);
        return p12Error ? failed(p12Error) : passed();
    }

    if (isPemCertificate(certPath)) {
        return validatePemCertificate(certPath, label);
    }

    return failed(
        `${label} has unknown format: ${certPath}\n  Supported formats: .pem, .crt, .p12, .pfx`
    );
}

function checkFileAccess(certPath: string, label: string): string | undefined {
    if (!fs.existsSync(certPath)) {
        return (
            `${label} not found: ${certPath}\n` +
            `  Suggestion: Verify the path in your .env file (CLIENT_CERT_PATH or CLIENT_CERT_CA_PATH)`
        );
    }

    try {
        fs.accessSync(certPath, fs.constants.R_OK);
        return undefined;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
            return (
                `${label} is not readable: ${certPath}\n` +
                `  Permission denied (EACCES)\n` +
                `  Suggestion: Check file permissions with 'ls -la ${certPath}' and ensure the current user has read access`
            );
        }
        return `${label} cannot be accessed: ${certPath}\n  Error: ${errorMessage(error)}`;
    }
}

function validatePemCertificate(certPath: string, label: string): CertificateValidationResult {
    let certContent: string;
    try {
        certContent = fs.readFileSync(certPath, 'utf-8');
    } catch (readError) {
        return failed(
            `${label} could not be read: ${certPath}\n  Error: ${errorMessage(readError)}`
        );
    }

    if (!certContent.includes('-----BEGIN CERTIFICATE-----')) {
        return failed(
            `${label} has invalid format: ${certPath}\n` +
                `  The file does not contain a valid PEM certificate (missing '-----BEGIN CERTIFICATE-----')\n` +
                `  Suggestion: Verify the file is a valid PEM certificate, not a private key or other format`
        );
    }

    let cert: X509Certificate;
    try {
        cert = new X509Certificate(certContent);
    } catch (parseError) {
        return failed(
            `${label} could not be parsed: ${certPath}\n` +
                `  Error: ${errorMessage(parseError)}\n` +
                `  Suggestion: Verify the file is a valid PEM certificate`
        );
    }

    return checkValidityPeriod(cert, certPath, label);
}

function checkValidityPeriod(
    cert: X509Certificate,
    certPath: string,
    label: string
): CertificateValidationResult {
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);
    const now = new Date();

    if (validTo < now) {
        return failed(
            `${label} has expired: ${certPath}\n` +
                `  Valid until: ${formatDate(validTo)} (${wholeDaysBetween(validTo, now)} days ago)\n` +
                `  Subject: ${cert.subject}\n` +
                `  Suggestion: Obtain a new certificate from your certificate authority`
        );
    }

    if (validFrom > now) {
        return failed(
            `${label} is not yet valid: ${certPath}\n` +
                `  Valid from: ${formatDate(validFrom)} (in ${wholeDaysBetween(now, validFrom)} days)\n` +
                `  Subject: ${cert.subject}\n` +
                `  Suggestion: Check your system clock or wait until the certificate becomes valid`
        );
    }

    const daysUntilExpiry = wholeDaysBetween(now, validTo);
    if (daysUntilExpiry >= EXPIRY_WARNING_DAYS) {
        return passed();
    }
    return {
        errors: [],
        warnings: [
            `${label} expires soon: ${certPath}\n` +
                `  Valid until: ${formatDate(validTo)} (${daysUntilExpiry} days remaining)\n` +
                `  Subject: ${cert.subject}\n` +
                `  Suggestion: Consider renewing the certificate before it expires`,
        ],
    };
}

function validateP12Certificate(
    certPath: string,
    label: string,
    certPassword: string | undefined
): string | undefined {
    let buffer: Buffer;
    try {
        buffer = fs.readFileSync(certPath);
    } catch (error) {
        return `${label} could not be validated: ${certPath}\n  Error: ${errorMessage(error)}`;
    }

    if (buffer.length < MIN_P12_BYTES) {
        return (
            `${label} appears to be corrupted: ${certPath}\n` +
            `  File is too small to be a valid P12/PFX certificate\n` +
            `  Suggestion: Verify the file is not corrupted and is a valid P12/PFX certificate`
        );
    }

    if (buffer[0] !== DER_SEQUENCE_TAG) {
        return (
            `${label} has invalid P12 format: ${certPath}\n` +
            `  The file does not appear to be a valid PKCS#12 (P12/PFX) certificate\n` +
            `  Suggestion: Verify the file is not corrupted and is a valid P12/PFX certificate`
        );
    }

    return certPassword === undefined ? undefined : checkP12Password(certPath, certPassword);
}

/**
 * Only openssl's "wrong password" exit status (1) is reported; anything else
 * (openssl missing, another failure) is not a configuration problem.
 */
function checkP12Password(certPath: string, password: string): string | undefined {
    // An argument array, so the password never passes through a shell
    const result = spawnSync(
        'openssl',
        ['pkcs12', '-in', certPath, '-passin', `pass:${password}`, '-noout'],
        { encoding: 'utf-8', stdio: 'pipe' }
    );

    if (result.status !== 1) {
        return undefined;
    }
    return (
        `${certPath}: Invalid CLIENT_CERT_PASSWORD\n` +
        `  The password provided does not match the P12/PFX certificate\n` +
        `  Suggestion: Verify CLIENT_CERT_PASSWORD in your .env file is correct, or set it to empty if the certificate has no password`
    );
}

function isPemCertificate(certPath: string): boolean {
    return certPath.endsWith('.pem') || certPath.endsWith('.crt');
}

function isP12Certificate(certPath: string): boolean {
    return certPath.endsWith('.p12') || certPath.endsWith('.pfx');
}

function wholeDaysBetween(earlier: Date, later: Date): number {
    return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
    });
}
