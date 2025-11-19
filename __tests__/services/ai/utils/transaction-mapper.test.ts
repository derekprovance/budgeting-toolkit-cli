import {
    mapTransactionForLLM,
    LLMTransactionData,
} from '../../../../src/services/ai/utils/transaction-mapper';
import { createMockTransaction } from '../../../shared/test-data';

describe('transaction-mapper', () => {
    describe('mapTransactionForLLM', () => {
        it('should map all required fields correctly', () => {
            const transaction = createMockTransaction({
                description: 'Walmart Supercenter',
                amount: '150.00',
                date: '2025-01-15T10:30:00Z',
                source_name: 'Checking Account',
                destination_name: 'Walmart',
                type: 'withdrawal',
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
            const transaction = createMockTransaction({
                description: 'Amazon Fresh',
                amount: '75.00',
                date: '2025-01-16',
                source_name: 'Checking',
                destination_name: 'Amazon',
                type: 'withdrawal',
                notes: null,
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.notes).toBeNull();
        });

        it('should handle transaction with undefined source_name', () => {
            const transaction = createMockTransaction({
                description: 'Test Transaction',
                amount: '100.00',
                date: '2025-01-15',
                source_name: undefined,
                destination_name: 'Destination',
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.source_account).toBeUndefined();
        });

        it('should handle transaction with undefined destination_name', () => {
            const transaction = createMockTransaction({
                description: 'Test Transaction',
                amount: '100.00',
                date: '2025-01-15',
                source_name: 'Source',
                destination_name: undefined,
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.destination_account).toBeUndefined();
        });

        it('should handle deposit transaction type', () => {
            const transaction = createMockTransaction({
                description: 'Paycheck',
                amount: '5000.00',
                date: '2025-01-15',
                source_name: 'Employer',
                destination_name: 'Checking Account',
                type: 'deposit',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.type).toBe('deposit');
        });

        it('should handle transfer transaction type', () => {
            const transaction = createMockTransaction({
                description: 'Transfer to Savings',
                amount: '500.00',
                date: '2025-01-15',
                source_name: 'Checking Account',
                destination_name: 'Savings Account',
                type: 'transfer',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.type).toBe('transfer');
            expect(result.source_account).toBe('Checking Account');
            expect(result.destination_account).toBe('Savings Account');
        });

        it('should handle empty string description', () => {
            const transaction = createMockTransaction({
                description: '',
                amount: '50.00',
                date: '2025-01-15',
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.description).toBe('');
        });

        it('should handle zero amount', () => {
            const transaction = createMockTransaction({
                description: 'Zero Amount Transaction',
                amount: '0.00',
                date: '2025-01-15',
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.amount).toBe('0.00');
        });

        it('should handle large amount with decimals', () => {
            const transaction = createMockTransaction({
                description: 'Large Purchase',
                amount: '9999999.99',
                date: '2025-01-15',
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.amount).toBe('9999999.99');
        });

        it('should handle negative amount (refund)', () => {
            const transaction = createMockTransaction({
                description: 'Refund',
                amount: '-50.00',
                date: '2025-01-15',
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.amount).toBe('-50.00');
        });

        it('should handle special characters in description', () => {
            const transaction = createMockTransaction({
                description: 'Café & Bakery - "Special" Items (50% off)',
                amount: '25.00',
                date: '2025-01-15',
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.description).toBe('Café & Bakery - "Special" Items (50% off)');
        });

        it('should handle special characters in account names', () => {
            const transaction = createMockTransaction({
                description: 'Test',
                amount: '100.00',
                date: '2025-01-15',
                source_name: "O'Reilly's Account",
                destination_name: 'Vendor & Co.',
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.source_account).toBe("O'Reilly's Account");
            expect(result.destination_account).toBe('Vendor & Co.');
        });

        it('should not include extra fields from TransactionSplit', () => {
            const transaction = createMockTransaction({
                description: 'Test',
                amount: '100.00',
                date: '2025-01-15',
                source_name: 'Source',
                destination_name: 'Destination',
                type: 'withdrawal',
                // These fields should NOT be in LLMTransactionData
                transaction_journal_id: '12345',
                budget_id: 'budget-123',
                category_name: 'Groceries',
                currency_code: 'USD',
            });

            const result = mapTransactionForLLM(transaction);

            // Type guard to ensure result is LLMTransactionData
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
            const transaction = createMockTransaction({
                description: longDescription,
                amount: '100.00',
                date: '2025-01-15',
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.description).toBe(longDescription);
            expect(result.description.length).toBe(500);
        });

        it('should handle multiline notes', () => {
            const transaction = createMockTransaction({
                description: 'Test',
                amount: '100.00',
                date: '2025-01-15',
                type: 'withdrawal',
                notes: 'Line 1\nLine 2\nLine 3',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.notes).toBe('Line 1\nLine 2\nLine 3');
        });

        it('should handle ISO date format', () => {
            const transaction = createMockTransaction({
                description: 'Test',
                amount: '100.00',
                date: '2025-01-15T14:30:00.000Z',
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.date).toBe('2025-01-15T14:30:00.000Z');
        });

        it('should handle simple date format', () => {
            const transaction = createMockTransaction({
                description: 'Test',
                amount: '100.00',
                date: '2025-01-15',
                type: 'withdrawal',
            });

            const result = mapTransactionForLLM(transaction);

            expect(result.date).toBe('2025-01-15');
        });

        it('should preserve type information correctly', () => {
            const transaction = createMockTransaction({
                description: 'Test',
                amount: '100.00',
                date: '2025-01-15',
                source_name: 'Source',
                destination_name: 'Destination',
                type: 'withdrawal',
            });

            const result: LLMTransactionData = mapTransactionForLLM(transaction);

            // TypeScript should enforce this structure
            expect(typeof result.description).toBe('string');
            expect(typeof result.amount).toBe('string');
            expect(typeof result.date).toBe('string');
            expect(typeof result.type).toBe('string');
        });
    });
});
