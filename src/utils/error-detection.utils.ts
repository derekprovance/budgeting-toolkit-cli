/**
 * OpenSSL error codes that indicate a TLS/certificate problem.
 */
const CERT_ERROR_CODES = new Set([
    'CERT_HAS_EXPIRED',
    'CERT_NOT_YET_VALID',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'UNABLE_TO_GET_ISSUER_CERT',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'CERT_UNTRUSTED',
    'CERT_REJECTED',
    'CERT_REVOKED',
]);

/**
 * Returns true if the error (or any error in its cause chain) is a TLS/certificate error.
 * Walks up to 5 levels deep in the error.cause chain to find certificate-related issues.
 */
export function isCertificateError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    // Regex with word boundaries to avoid false positives like "certified" or "certify"
    const certKeywordRegex = /\b(certificate|ssl|tls)\b/i;

    let current: unknown = error;
    let depth = 0;
    const MAX_DEPTH = 5;

    while (current instanceof Error && depth < MAX_DEPTH) {
        // Check .code property (present on NodeJS.ErrnoException and AxiosError cause chains)
        const code = (current as NodeJS.ErrnoException).code;
        if (code && CERT_ERROR_CODES.has(code)) return true;

        // Check the message for certificate-related keywords with word boundaries
        if (certKeywordRegex.test(current.message)) return true;

        // Traverse cause chain
        current = (current as Error & { cause?: unknown }).cause;
        depth++;
    }

    return false;
}
