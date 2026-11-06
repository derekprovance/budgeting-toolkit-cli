import {
    mapTransactionForLLM,
    LLMTransactionData,
} from '../../../../src/services/ai/utils/transaction-mapper.js';
import { deposit, transfer, withdrawal } from '../../../shared/test-data.js';

describe('transaction-mapper', () => {
    describe('mapTransactionForLLM', () => {
        it('should map all required fields correctly', () => {
            const transaction = withdrawal('150.00', {
                description: 'Walmart Supercenter',
                date: '2025-01-15T10:30:00Z',
                source_name: 'Checking Account',
                destination_name: 'Walmart',
                notes: 'Weekly grocery shopping',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result).toEqual({
                description: 'Walmart Supercenter',
                amount: '150.00',
                date: '2025-01-15T10:30:00Z',
                source_account: 'Checking Account',
                destination_account: 'Walmart',
                type: 'withdrawal',
                notes: 'Weekly grocery shopping',
            });
        });

        it('should handle transaction with null notes', () => {
            const transaction = withdrawal('75.00', {
                description: 'Amazon Fresh',
                date: '2025-01-16',
                source_name: 'Checking',
                destination_name: 'Amazon',
                notes: null,
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.notes).toBeNull();
        });

        it('should handle transaction with undefined source_name', () => {
            const transaction = withdrawal('100.00', {
                description: 'Test Transaction',
                date: '2025-01-15',
                source_name: undefined,
                destination_name: 'Destination',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.source_account).toBeUndefined();
        });

        it('should handle transaction with undefined destination_name', () => {
            const transaction = withdrawal('100.00', {
                description: 'Test Transaction',
                date: '2025-01-15',
                source_name: 'Source',
                destination_name: undefined,
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.destination_account).toBeUndefined();
        });

        it('should handle deposit transaction type', () => {
            const transaction = deposit('5000.00', {
                description: 'Paycheck',
                date: '2025-01-15',
                source_name: 'Employer',
                destination_name: 'Checking Account',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.type).toBe('deposit');
        });

        it('should handle transfer transaction type', () => {
            const transaction = transfer('500.00', {
                description: 'Transfer to Savings',
                date: '2025-01-15',
                source_name: 'Checking Account',
                destination_name: 'Savings Account',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.type).toBe('transfer');
            expect(result.source_account).toBe('Checking Account');
            expect(result.destination_account).toBe('Savings Account');
        });

        it('should handle empty string description', () => {
            const transaction = withdrawal('50.00', {
                description: '',
                date: '2025-01-15',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.description).toBe('');
        });

        it('should handle zero amount', () => {
            const transaction = withdrawal('0.00', {
                description: 'Zero Amount Transaction',
                date: '2025-01-15',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.amount).toBe('0.00');
        });

        it('should handle large amount with decimals', () => {
            const transaction = withdrawal('9999999.99', {
                description: 'Large Purchase',
                date: '2025-01-15',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.amount).toBe('9999999.99');
        });

        it('should pass a refund through as an unsigned deposit', () => {
            // Firefly never signs amounts: a refund is a deposit, and the
            // direction reaches the model through `type`.
            const transaction = deposit('50.00', {
                description: 'Refund',
                date: '2025-01-15',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.amount).toBe('50.00');
            expect(result.type).toBe('deposit');
        });

        it('should handle special characters in description', () => {
            const transaction = withdrawal('25.00', {
                description: 'Café & Bakery - "Special" Items (50% off)',
                date: '2025-01-15',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.description).toBe('Café & Bakery - "Special" Items (50% off)');
        });

        it('should handle special characters in account names', () => {
            const transaction = withdrawal('100.00', {
                description: 'Test',
                date: '2025-01-15',
                source_name: "O'Reilly's Account",
                destination_name: 'Vendor & Co.',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.source_account).toBe("O'Reilly's Account");
            expect(result.destination_account).toBe('Vendor & Co.');
        });

        it('should not include extra fields from TransactionSplit', () => {
            const transaction = withdrawal('100.00', {
                description: 'Test',
                date: '2025-01-15',
                source_name: 'Source',
                destination_name: 'Destination',
                // These fields should NOT be in LLMTransactionData
                transaction_journal_id: '12345',
                budget_id: 'budget-123',
                category_name: 'Groceries',
                currency_code: 'USD',
            });

            const result = mapTransactionForLLM(transaction);

            const keys = Object.keys(result);
            expect(keys).toEqual([
                'description',
                'amount',
                'date',
                'source_account',
                'destination_account',
                'type',
                'notes',
            ]);
        });

        it('should handle long description text', () => {
            const longDescription = 'A'.repeat(500);
            const transaction = withdrawal('100.00', {
                description: longDescription,
                date: '2025-01-15',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.description).toBe(longDescription);
            expect(result.description.length).toBe(500);
        });

        it('should handle multiline notes', () => {
            const transaction = withdrawal('100.00', {
                description: 'Test',
                date: '2025-01-15',
                notes: 'Line 1\nLine 2\nLine 3',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.notes).toBe('Line 1\nLine 2\nLine 3');
        });

        it('should handle ISO date format', () => {
            const transaction = withdrawal('100.00', {
                description: 'Test',
                date: '2025-01-15T14:30:00.000Z',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.date).toBe('2025-01-15T14:30:00.000Z');
        });

        it('should handle simple date format', () => {
            const transaction = withdrawal('100.00', {
                description: 'Test',
                date: '2025-01-15',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.date).toBe('2025-01-15');
        });

        it('should preserve type information correctly', () => {
            const transaction = withdrawal('100.00', {
                description: 'Test',
                date: '2025-01-15',
                source_name: 'Source',
                destination_name: 'Destination',
            });

            const result: LLMTransactionData = mapTransactionForLLM(transaction);

            expect(typeof result.description).toBe('string');
            expect(typeof result.amount).toBe('string');
            expect(typeof result.date).toBe('string');
            expect(typeof result.type).toBe('string');
        });
    });
});
