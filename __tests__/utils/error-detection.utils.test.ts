import { describe, it, expect } from '@jest/globals';
import { isCertificateError } from '../../src/utils/error-detection.utils.js';

describe('isCertificateError', () => {
    describe('non-Error inputs', () => {
        it('returns false for null', () => {
            expect(isCertificateError(null)).toBe(false);
        });

        it('returns false for undefined', () => {
            expect(isCertificateError(undefined)).toBe(false);
        });

        it('returns false for a plain string', () => {
            expect(isCertificateError('some error message')).toBe(false);
        });

        it('returns false for a plain object', () => {
            expect(isCertificateError({ message: 'error' })).toBe(false);
        });
    });

    describe('generic errors', () => {
        it('returns false for a generic Error with no cert indicators', () => {
            const error = new Error('Something went wrong');
            expect(isCertificateError(error)).toBe(false);
        });

        it('returns false for an Error with unrelated message', () => {
            const error = new Error('Connection refused');
            expect(isCertificateError(error)).toBe(false);
        });
    });

    describe('OpenSSL error codes on the top-level error', () => {
        it('returns true for CERT_HAS_EXPIRED', () => {
            const error = Object.assign(new Error('certificate has expired'), {
                code: 'CERT_HAS_EXPIRED',
            });
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns true for SELF_SIGNED_CERT_IN_CHAIN', () => {
            const error = Object.assign(new Error('self signed certificate'), {
                code: 'SELF_SIGNED_CERT_IN_CHAIN',
            });
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns true for DEPTH_ZERO_SELF_SIGNED_CERT', () => {
            const error = Object.assign(new Error('depth zero self signed cert'), {
                code: 'DEPTH_ZERO_SELF_SIGNED_CERT',
            });
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns true for UNABLE_TO_VERIFY_LEAF_SIGNATURE', () => {
            const error = Object.assign(new Error('unable to verify'), {
                code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
            });
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns true for CERT_NOT_YET_VALID', () => {
            const error = Object.assign(new Error('cert not yet valid'), {
                code: 'CERT_NOT_YET_VALID',
            });
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns true for UNABLE_TO_GET_ISSUER_CERT_LOCALLY', () => {
            const error = Object.assign(new Error('unable to get issuer'), {
                code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
            });
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns true for ERR_TLS_CERT_ALTNAME_INVALID', () => {
            const error = Object.assign(new Error('altname invalid'), {
                code: 'ERR_TLS_CERT_ALTNAME_INVALID',
            });
            expect(isCertificateError(error)).toBe(true);
        });
    });

    describe('error message keywords', () => {
        it('returns true when message contains "certificate"', () => {
            const error = new Error('The certificate has expired');
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns true when message contains word "certificate" (word boundary)', () => {
            const error = new Error('certificate validation failed');
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns false for "CERT" as substring without word boundary', () => {
            const error = new Error('CERT_VALIDATION_FAILED');
            expect(isCertificateError(error)).toBe(false);
        });

        it('returns true when message contains "ssl"', () => {
            const error = new Error('SSL handshake failed');
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns true when message contains "tls"', () => {
            const error = new Error('TLS connection error');
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns false for "sslide" (not a word boundary match)', () => {
            const error = new Error('This is sslide show');
            expect(isCertificateError(error)).toBe(false);
        });

        it('returns true for standalone "ssl" with word boundaries', () => {
            const error = new Error('SSL handshake failed');
            expect(isCertificateError(error)).toBe(true);
        });

        it('returns false for "certified" (not a cert keyword)', () => {
            const error = new Error('Service is certified by authority');
            expect(isCertificateError(error)).toBe(false);
        });
    });

    describe('cause chain traversal (AxiosError pattern)', () => {
        it('returns true when the cause has an OpenSSL error code', () => {
            const innerError = Object.assign(new Error('certificate has expired'), {
                code: 'CERT_HAS_EXPIRED',
            });
            const outerError = new Error('Request failed');
            (outerError as Error & { cause?: unknown }).cause = innerError;
            expect(isCertificateError(outerError)).toBe(true);
        });

        it('returns true when the cause has a cert keyword in its message', () => {
            const innerError = new Error('SSL certificate validation failed');
            const outerError = new Error('HTTP request failed');
            (outerError as Error & { cause?: unknown }).cause = innerError;
            expect(isCertificateError(outerError)).toBe(true);
        });

        it('traverses multiple levels deep in the cause chain', () => {
            const deepError = Object.assign(new Error('cert error'), {
                code: 'CERT_HAS_EXPIRED',
            });
            const middleError = new Error('Inner error');
            (middleError as Error & { cause?: unknown }).cause = deepError;
            const outerError = new Error('Outer error');
            (outerError as Error & { cause?: unknown }).cause = middleError;
            expect(isCertificateError(outerError)).toBe(true);
        });

        it('returns false when no cause has cert indicators', () => {
            const innerError = new Error('Generic network error');
            const outerError = new Error('Request failed');
            (outerError as Error & { cause?: unknown }).cause = innerError;
            expect(isCertificateError(outerError)).toBe(false);
        });

        it('stops traversing after MAX_DEPTH (5 levels)', () => {
            let current = Object.assign(new Error('certificate error'), {
                code: 'CERT_HAS_EXPIRED',
            });
            const levels: Error[] = [current];

            // Build a chain 6 levels deep
            for (let i = 0; i < 6; i++) {
                const outer = new Error(`Level ${i}`);
                (outer as Error & { cause?: unknown }).cause = current;
                levels.push(outer);
                current = outer;
            }

            // The cert error is at the bottom, but MAX_DEPTH is 5
            // So we should NOT find it
            expect(isCertificateError(levels[6])).toBe(false);
        });

        it('handles non-Error causes gracefully', () => {
            const error = new Error('Request failed');
            (error as Error & { cause?: unknown }).cause = 'not an error';
            expect(isCertificateError(error)).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('returns true when error.code is on a NodeJS.ErrnoException-like object', () => {
            const error = Object.assign(new Error('bad cert'), {
                code: 'CERT_UNTRUSTED',
                errno: -51,
                syscall: 'getaddrinfo',
            });
            expect(isCertificateError(error)).toBe(true);
        });

        it('ignores code property if it is not a cert error code', () => {
            const error = Object.assign(new Error('network error'), {
                code: 'ENOTFOUND',
            });
            expect(isCertificateError(error)).toBe(false);
        });
    });
});
