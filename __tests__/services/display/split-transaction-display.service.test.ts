import { describe, it, expect, beforeEach } from '@jest/globals';
import { SplitTransactionDisplayService } from '../../../src/services/display/split-transaction-display.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

describe('SplitTransactionDisplayService', () => {
    let service: SplitTransactionDisplayService;
    const baseUrl = 'https://firefly.example.com';

    const createMockSplit = (overrides?: Partial<TransactionSplit>): TransactionSplit => ({
        transaction_journal_id: 'journal-123',
        type: 'withdrawal',
        date: '2024-01-15',
        amount: '100.00',
        description: 'Test Transaction',
        source_id: 'source-1',
        source_name: 'Checking Account',
        destination_id: 'dest-1',
        destination_name: 'Grocery Store',
        currency_id: 'curr-1',
        currency_code: 'USD',
        currency_symbol: '$',
        category_name: 'Groceries',
        budget_id: 'budget-1',
        budget_name: 'Monthly Budget',
        tags: ['shopping', 'food'],
        ...overrides,
    });

    beforeEach(() => {
        service = new SplitTransactionDisplayService(baseUrl);
    });

    describe('formatOriginalTransaction', () => {
        it('should format transaction with all fields', () => {
            const transaction = createMockSplit();
            const result = service.formatOriginalTransaction(transaction, '123');

            expect(result).toContain('Original Transaction:');
            expect(result).toContain('Test Transaction');
            expect(result).toContain('$100.00');
            expect(result).toContain('2024-01-15');
            expect(result).toContain('Groceries');
            expect(result).toContain('Monthly Budget');
            expect(result).toContain('Checking Account');
            expect(result).toContain('Grocery Store');
            expect(result).toContain(`${baseUrl}/transactions/show/123`);
        });

        it('should format transaction with missing optional fields', () => {
            const transaction = createMockSplit({
                category_name: undefined,
                budget_name: undefined,
                source_name: undefined,
                destination_name: undefined,
            });
            const result = service.formatOriginalTransaction(transaction, '123');

            expect(result).toContain('Test Transaction');
            expect(result).toContain('$100.00');
            expect(result).not.toContain('Groceries');
            expect(result).not.toContain('Monthly Budget');
            expect(result).not.toContain('Checking Account');
            expect(result).not.toContain('Grocery Store');
        });
    });

    describe('formatSplitPreview', () => {
        it('should format preview with descriptions and amounts', () => {
            const result = service.formatSplitPreview(
                'Test Transaction',
                '60.00',
                'Test Transaction - Part 1',
                '40.00',
                'Test Transaction - Part 2',
                '$'
            );

            expect(result).toContain('Split Preview:');
            expect(result).toContain('Parent Transaction:');
            expect(result).toContain('Test Transaction');
            expect(result).toContain('Split 1:');
            expect(result).toContain('Test Transaction - Part 1');
            expect(result).toContain('$60.00');
            expect(result).toContain('preserves category, budget, and tags from original');
            expect(result).toContain('Split 2:');
            expect(result).toContain('Test Transaction - Part 2');
            expect(result).toContain('$40.00');
            expect(result).toContain('category and budget left unset for manual assignment');
        });

        it('should indicate metadata behavior for both splits', () => {
            const result = service.formatSplitPreview(
                'Test Transaction',
                '60.00',
                'Part 1',
                '40.00',
                'Part 2',
                '$'
            );

            expect(result).toContain('Split 1:');
            expect(result).toContain('preserves category, budget, and tags from original');
            expect(result).toContain('Split 2:');
            expect(result).toContain('category and budget left unset for manual assignment');
        });
    });

    describe('formatSuccess', () => {
        it('should format success message with transaction link', () => {
            const result = service.formatSuccess('123', 2);

            expect(result).toContain('Created 2 splits from original transaction');
            expect(result).toContain(`View at: ${baseUrl}/transactions/show/123`);
        });

        it('should handle different split counts', () => {
            const result = service.formatSuccess('456', 3);

            expect(result).toContain('Created 3 splits from original transaction');
        });
    });

    describe('formatError', () => {
        it('should format error message', () => {
            const error = new Error('Transaction not found');
            const result = service.formatError(error);

            expect(result).toContain('Failed to split transaction');
            expect(result).toContain('Error: Transaction not found');
        });

        it('should handle errors with detailed messages', () => {
            const error = new Error('Split amounts do not equal original amount');
            const result = service.formatError(error);

            expect(result).toContain('Split amounts do not equal original amount');
        });
    });

    describe('formatHeader', () => {
        it('should format header with transaction ID', () => {
            const result = service.formatHeader('123');

            expect(result).toContain('Transaction Split Tool');
            expect(result).toContain('Transaction ID: 123');
            expect(result).toContain('='.repeat(60));
        });
    });

    describe('formatAmountPrompt', () => {
        it('should format amount prompt with currency symbol', () => {
            const result = service.formatAmountPrompt(100.5, '$');

            expect(result).toContain('Enter amount for first split');
            expect(result).toContain('original: $100.5');
        });

        it('should handle different currency symbols', () => {
            const result = service.formatAmountPrompt(75.25, '€');

            expect(result).toContain('original: €75.25');
        });
    });

    describe('formatRemainder', () => {
        it('should format remainder with currency symbol', () => {
            const result = service.formatRemainder(40.5, '$');

            expect(result).toContain('Remainder for second split: $40.50');
        });

        it('should format to 2 decimal places', () => {
            const result = service.formatRemainder(33.333, '$');

            expect(result).toContain('$33.33');
        });
    });

    describe('formatValidationError', () => {
        it('should format validation error message', () => {
            const result = service.formatValidationError('Amount must be greater than zero');

            expect(result).toContain('✗');
            expect(result).toContain('Amount must be greater than zero');
        });
    });

    describe('transaction link generation', () => {
        it('should generate correct transaction link', () => {
            const result = service.formatSuccess('789', 2);

            expect(result).toContain(`${baseUrl}/transactions/show/789`);
        });

        it('should use base URL from constructor', () => {
            const customService = new SplitTransactionDisplayService('https://custom.firefly.com');
            const result = customService.formatSuccess('123', 2);

            expect(result).toContain('https://custom.firefly.com/transactions/show/123');
        });
    });
});
