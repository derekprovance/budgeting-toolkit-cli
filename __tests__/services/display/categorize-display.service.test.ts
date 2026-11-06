// chalk is not mocked: FORCE_COLOR=0 (__tests__/setup/env.ts) keeps output plain.
import { CategorizeDisplayService } from '../../../src/services/display/categorize-display.service.js';
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

    describe('formatTransactionErrors', () => {
        it('lists each failed transaction with its message', () => {
            const result = service.formatTransactionErrors([
                {
                    field: 'category',
                    message: 'Invalid category',
                    userMessage: 'The suggested category "Nope" doesn\'t exist.',
                    transactionId: '1',
                    transactionDescription: 'Coffee Bar',
                },
            ]);

            expect(result).toContain('1 transaction(s) failed validation');
            expect(result).toContain('  • Coffee Bar');
            expect(result).toContain('    The suggested category "Nope" doesn\'t exist.');
            expect(result).toContain('Please check your categories and budgets in Firefly III.');
        });
    });

    describe('formatCertificateHelp', () => {
        it('names the certificate settings to check', () => {
            const result = service.formatCertificateHelp();

            expect(result).toContain('This looks like a TLS/certificate error');
            expect(result).toContain('CLIENT_CERT_PATH');
            expect(result).toContain('CLIENT_CERT_PASSWORD');
            expect(result).toContain('CLIENT_CERT_CA_PATH');
        });
    });
});
