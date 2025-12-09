import * as fs from 'fs';
import { X509Certificate } from 'crypto';

export interface CertificateValidationResult {
    errors: string[];
    warnings: string[];
}

/**
 * Validates certificates with detailed error messages.
 * Supports PEM and P12/PFX formats with expiration checking.
 */
export class CertificateValidator {
    /**
     * Validate a certificate file with comprehensive checks
     */
    validateCertificate(certPath: string, certType: 'client' | 'ca'): CertificateValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check file access (existence and readability)
        const accessError = this.checkFileAccess(certPath, certType);
        if (accessError) {
            errors.push(accessError);
            return { errors, warnings };
        }

        // Determine certificate format and validate accordingly
        if (this.isP12Certificate(certPath)) {
            const p12Error = this.validateP12Certificate(certPath, certType);
            if (p12Error) errors.push(p12Error);
        } else if (this.isPemCertificate(certPath)) {
            const pemResult = this.validatePemCertificate(certPath, certType);
            errors.push(...pemResult.errors);
            warnings.push(...pemResult.warnings);
        } else {
            errors.push(
                `${this.capitalize(certType)} certificate has unknown format: ${certPath}\n  Supported formats: .pem, .crt, .p12, .pfx`
            );
        }

        return { errors, warnings };
    }

    /**
     * Check file exists and is readable
     */
    private checkFileAccess(certPath: string, certType: string): string | null {
        try {
            // Check if file exists
            if (!fs.existsSync(certPath)) {
                return (
                    `${this.capitalize(certType)} certificate not found: ${certPath}\n` +
                    `  Suggestion: Verify the path in your .env file (CLIENT_CERT_PATH or CLIENT_CERT_CA_PATH)`
                );
            }

            // Check if file is readable
            fs.accessSync(certPath, fs.constants.R_OK);
            return null; // No error
        } catch (error) {
            const err = error as NodeJS.ErrnoException;

            if (err.code === 'EACCES') {
                return (
                    `${this.capitalize(certType)} certificate is not readable: ${certPath}\n` +
                    `  Permission denied (EACCES)\n` +
                    `  Suggestion: Check file permissions with 'ls -la ${certPath}' and ensure the current user has read access`
                );
            }

            return (
                `${this.capitalize(certType)} certificate cannot be accessed: ${certPath}\n` +
                `  Error: ${err.message}`
            );
        }
    }

    /**
     * Validate PEM certificate (includes expiration checking)
     */
    private validatePemCertificate(
        certPath: string,
        certType: string
    ): CertificateValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            const certContent = fs.readFileSync(certPath, 'utf-8');

            // Check for PEM header
            if (!certContent.includes('-----BEGIN CERTIFICATE-----')) {
                errors.push(
                    `${this.capitalize(certType)} certificate has invalid format: ${certPath}\n` +
                        `  The file does not contain a valid PEM certificate (missing '-----BEGIN CERTIFICATE-----')\n` +
                        `  Suggestion: Verify the file is a valid PEM certificate, not a private key or other format`
                );
                return { errors, warnings };
            }

            // Parse certificate
            try {
                const cert = new X509Certificate(certContent);
                const validFrom = new Date(cert.validFrom);
                const validTo = new Date(cert.validTo);
                const now = new Date();

                // Check if expired
                if (validTo < now) {
                    const daysAgo = Math.floor(
                        (now.getTime() - validTo.getTime()) / (1000 * 60 * 60 * 24)
                    );
                    errors.push(
                        `${this.capitalize(certType)} certificate has expired: ${certPath}\n` +
                            `  Valid until: ${this.formatDate(validTo)} (${daysAgo} days ago)\n` +
                            `  Subject: ${cert.subject}\n` +
                            `  Suggestion: Obtain a new certificate from your certificate authority`
                    );
                    return { errors, warnings };
                }

                // Check if not yet valid
                if (validFrom > now) {
                    const daysUntil = Math.floor(
                        (validFrom.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                    );
                    errors.push(
                        `${this.capitalize(certType)} certificate is not yet valid: ${certPath}\n` +
                            `  Valid from: ${this.formatDate(validFrom)} (in ${daysUntil} days)\n` +
                            `  Subject: ${cert.subject}\n` +
                            `  Suggestion: Check your system clock or wait until the certificate becomes valid`
                    );
                    return { errors, warnings };
                }

                // Warn if expiring soon (within 30 days)
                const daysUntilExpiry = Math.floor(
                    (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                );
                if (daysUntilExpiry < 30 && daysUntilExpiry >= 0) {
                    warnings.push(
                        `${this.capitalize(certType)} certificate expires soon: ${certPath}\n` +
                            `  Valid until: ${this.formatDate(validTo)} (${daysUntilExpiry} days remaining)\n` +
                            `  Subject: ${cert.subject}\n` +
                            `  Suggestion: Consider renewing the certificate before it expires`
                    );
                }
            } catch (parseError) {
                errors.push(
                    `${this.capitalize(certType)} certificate could not be parsed: ${certPath}\n` +
                        `  Error: ${(parseError as Error).message}\n` +
                        `  Suggestion: Verify the file is a valid PEM certificate`
                );
            }
        } catch (readError) {
            errors.push(
                `${this.capitalize(certType)} certificate could not be read: ${certPath}\n` +
                    `  Error: ${(readError as Error).message}`
            );
        }

        return { errors, warnings };
    }

    /**
     * Validate P12/PFX certificate (basic structure check only)
     */
    private validateP12Certificate(certPath: string, certType: string): string | null {
        try {
            const buffer = fs.readFileSync(certPath);

            // Check file size (P12 files should be at least 100 bytes)
            if (buffer.length < 100) {
                return (
                    `${this.capitalize(certType)} certificate appears to be corrupted: ${certPath}\n` +
                    `  File is too small to be a valid P12/PFX certificate\n` +
                    `  Suggestion: Verify the file is not corrupted and is a valid P12/PFX certificate`
                );
            }

            // Basic PKCS#12 structure check (should start with 0x30 for DER SEQUENCE)
            if (buffer[0] !== 0x30) {
                return (
                    `${this.capitalize(certType)} certificate has invalid P12 format: ${certPath}\n` +
                    `  The file does not appear to be a valid PKCS#12 (P12/PFX) certificate\n` +
                    `  Suggestion: Verify the file is not corrupted and is a valid P12/PFX certificate`
                );
            }

            return null; // Valid P12 structure
        } catch (error) {
            return (
                `${this.capitalize(certType)} certificate could not be validated: ${certPath}\n` +
                `  Error: ${(error as Error).message}`
            );
        }
    }

    /**
     * Check if certificate path indicates PEM format
     */
    private isPemCertificate(certPath: string): boolean {
        return certPath.endsWith('.pem') || certPath.endsWith('.crt');
    }

    /**
     * Check if certificate path indicates P12 format
     */
    private isP12Certificate(certPath: string): boolean {
        return certPath.endsWith('.p12') || certPath.endsWith('.pfx');
    }

    /**
     * Format date for display
     */
    private formatDate(date: Date): string {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
        });
    }

    /**
     * Format certificate type for display (handles acronyms)
     */
    private capitalize(str: string): string {
        // Special case for acronyms
        if (str === 'ca') return 'CA';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
