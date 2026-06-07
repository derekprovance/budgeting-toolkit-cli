// Mock chalk with chained methods
const createChalkMock = () => {
    interface ChalkChain {
        (text: string): string;
        bold: ChalkChain;
        cyan: ChalkChain;
        yellow: ChalkChain;
        blue: ChalkChain;
        blueBright: ChalkChain;
        gray: ChalkChain;
        green: ChalkChain;
        red: ChalkChain;
        redBright: ChalkChain;
        white: ChalkChain;
    }

    const chainedFn = ((text: string) => text) as unknown as ChalkChain;
    const methods = [
        'bold',
        'cyan',
        'yellow',
        'blue',
        'blueBright',
        'gray',
        'green',
        'red',
        'redBright',
        'white',
    ] as const;

    methods.forEach(method => {
        chainedFn[method] = ((text?: string) => {
            if (text === undefined) {
                return chainedFn;
            }
            return text;
        }) as unknown as ChalkChain;
    });

    return chainedFn;
};

jest.mock('chalk', () => createChalkMock());

import { CategorizeDisplayService } from '../../../src/services/display/categorize-display.service.js';
import { jest } from '@jest/globals';
import { CategorizeMode } from '../../../src/types/enums.js';

describe('CategorizeDisplayService', () => {
    let service: CategorizeDisplayService;

    beforeEach(() => {
        service = new CategorizeDisplayService();
    });

    describe('formatProcessingHeader', () => {
        it('should format the processing header correctly', () => {
            const result = service.formatProcessingHeader('test-tag', CategorizeMode.Both);
            expect(result).toContain(
                'Processing transactions with tag "test-tag" for categories and budgets'
            );
        });
    });

    describe('formatTagNotFound', () => {
        it('should format the tag not found message correctly', () => {
            const result = service.formatTagNotFound('test-tag');
            expect(result).toContain('❌ Tag "test-tag" not found');
        });
    });

    describe('formatEmptyTag', () => {
        it('should format the empty tag message correctly', () => {
            const result = service.formatEmptyTag('test-tag');
            expect(result).toContain('No processable transactions found with tag "test-tag"');
        });
    });

    describe('formatError', () => {
        it('should format error messages correctly', () => {
            const error = new Error('Test error message');
            const result = service.formatError(error);
            expect(result).toContain('Error processing transactions');
            expect(result).toContain('Test error message');
        });

        it('should handle non-Error objects', () => {
            const result = service.formatError('Test error');
            expect(result).toContain('Error processing transactions');
            expect(result).toContain('Test error');
        });

        it('should show cert hint for certificate errors', () => {
            const error = Object.assign(new Error('certificate has expired'), {
                code: 'CERT_HAS_EXPIRED',
            });
            const result = service.formatError(error);
            expect(result).toContain('Error processing transactions');
            expect(result).toContain('certificate has expired');
            expect(result).toContain('This looks like a TLS/certificate error');
            expect(result).toContain('CLIENT_CERT_PATH');
            expect(result).toContain('CLIENT_CERT_PASSWORD');
            expect(result).toContain('CLIENT_CERT_CA_PATH');
        });

        it('should show cert hint when error.cause has cert error code', () => {
            const innerError = Object.assign(new Error('certificate expired'), {
                code: 'CERT_HAS_EXPIRED',
            });
            const outerError = new Error('Request failed');
            (outerError as Error & { cause?: unknown }).cause = innerError;
            const result = service.formatError(outerError);
            expect(result).toContain('Error processing transactions');
            expect(result).toContain('Request failed');
            expect(result).toContain('This looks like a TLS/certificate error');
            expect(result).toContain('CLIENT_CERT_PATH');
        });

        it('should NOT show cert hint for generic errors', () => {
            const error = new Error('Connection timeout');
            const result = service.formatError(error);
            expect(result).toContain('Error processing transactions');
            expect(result).toContain('Connection timeout');
            expect(result).not.toContain('This looks like a TLS/certificate error');
            expect(result).not.toContain('CLIENT_CERT_PATH');
        });

        it('should show cert hint when message contains certificate keyword', () => {
            const error = new Error('SSL certificate validation failed');
            const result = service.formatError(error);
            expect(result).toContain('Error processing transactions');
            expect(result).toContain('This looks like a TLS/certificate error');
            expect(result).toContain('CLIENT_CERT_PASSWORD');
        });
    });
});
