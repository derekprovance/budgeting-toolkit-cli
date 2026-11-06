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

/** Walks up to 5 levels of the `cause` chain. */
export function isCertificateError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    // Word boundaries, so "certified" does not match
    const certKeywordRegex = /\b(certificate|ssl|tls)\b/i;

    let current: unknown = error;
    let depth = 0;
    const MAX_DEPTH = 5;

    while (current instanceof Error && depth < MAX_DEPTH) {
        const code = (current as NodeJS.ErrnoException).code;
        if (code && CERT_ERROR_CODES.has(code)) return true;

        if (certKeywordRegex.test(current.message)) return true;

        current = current.cause;
        depth++;
    }

    return false;
}

export function toError(thrown: unknown): Error {
    return thrown instanceof Error ? thrown : new Error(String(thrown));
}

export function errorMessage(thrown: unknown): string {
    return toError(thrown).message;
}
