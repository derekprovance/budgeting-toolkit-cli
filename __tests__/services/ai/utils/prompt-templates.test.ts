import {
    getFunctionSchema,
    getSystemPrompt,
    getUserPrompt,
    parseAssignmentResponse,
} from '../../../../src/services/ai/utils/prompt-templates.js';
import { LLMTransactionData } from '../../../../src/services/ai/utils/transaction-mapper.js';

describe('prompt-templates', () => {
    describe('getFunctionSchema', () => {
        it('should generate correct schema for category type', () => {
            const validCategories = ['Groceries', 'Healthcare', '(no category)'];
            const schema = getFunctionSchema('category', validCategories);

            expect(schema).toEqual({
                name: 'assign_categories',
                description:
                    'Assign the closest matching category from the available options to each transaction in the exact order provided. Return "(no category)" if no category fits.',
                parameters: {
                    type: 'object',
                    properties: {
                        categories: {
                            type: 'array',
                            items: {
                                type: 'string',
                                enum: validCategories,
                            },
                            description:
                                'Array of categories corresponding to each transaction in order',
                        },
                    },
                    required: ['categories'],
                },
            });
        });

        it('should generate correct schema for budget type', () => {
            const validBudgets = ['Food', 'Medical', '(no budget)'];
            const schema = getFunctionSchema('budget', validBudgets);

            expect(schema).toEqual({
                name: 'assign_budgets',
                description:
                    'Assign the closest matching budget from the available options to each transaction in the exact order provided. Return "(no budget)" if no budget fits.',
                parameters: {
                    type: 'object',
                    properties: {
                        budgets: {
                            type: 'array',
                            items: {
                                type: 'string',
                                enum: validBudgets,
                            },
                            description:
                                'Array of budgets corresponding to each transaction in order',
                        },
                    },
                    required: ['budgets'],
                },
            });
        });

        it('should handle single valid option', () => {
            const schema = getFunctionSchema('category', ['OnlyOption']);

            expect(schema.parameters.properties.categories.items.enum).toEqual(['OnlyOption']);
        });

        it('should handle empty array (edge case)', () => {
            const schema = getFunctionSchema('category', []);

            expect(schema.parameters.properties.categories.items.enum).toEqual([]);
        });
    });

    describe('getSystemPrompt', () => {
        it('should generate correct system prompt for category type', () => {
            const prompt = getSystemPrompt('category');

            expect(prompt).toBe(
                'You are a financial transaction category assignment assistant. Analyze transactions and assign the most appropriate category from the provided list. Be consistent and precise.'
            );
        });

        it('should generate correct system prompt for budget type', () => {
            const prompt = getSystemPrompt('budget');

            expect(prompt).toBe(
                'You are a financial transaction budget assignment assistant. Analyze transactions and assign the most appropriate budget from the provided list. Be consistent and precise.'
            );
        });
    });

    describe('getUserPrompt', () => {
        let transactions: LLMTransactionData[];
        let validCategories: string[];
        let validBudgets: string[];

        beforeEach(() => {
            transactions = [
                {
                    description: 'Walmart Supercenter',
                    amount: '150.00',
                    date: '2025-01-15',
                    source_account: 'Checking Account',
                    destination_account: 'Walmart',
                    type: 'withdrawal',
                },
                {
                    description: 'Walmart Pharmacy',
                    amount: '25.00',
                    date: '2025-01-16',
                    source_account: 'Checking Account',
                    destination_account: 'Walmart Pharmacy',
                    type: 'withdrawal',
                },
            ];

            validCategories = ['Groceries', 'Healthcare', 'Shopping', '(no category)'];
            validBudgets = ['Food', 'Medical', 'Shopping', '(no budget)'];
        });

        it('should generate correct user prompt for category type', () => {
            const prompt = getUserPrompt('category', transactions, validCategories);

            expect(prompt).toContain(
                'Assign the most appropriate category to each transaction below.'
            );
            expect(prompt).toContain('Available categories:');
            expect(prompt).toContain('- Groceries');
            expect(prompt).toContain('- Healthcare');
            expect(prompt).toContain('- Shopping');
            expect(prompt).toContain('- (no category)');
            expect(prompt).toContain('Transactions to categorize:');
            expect(prompt).toContain(
                '1. Walmart Supercenter - $150.00 - 2025-01-15 (Checking Account → Walmart)'
            );
            expect(prompt).toContain(
                '2. Walmart Pharmacy - $25.00 - 2025-01-16 (Checking Account → Walmart Pharmacy)'
            );
            expect(prompt).toContain('Return the categories in the exact same order');
            expect(prompt).toContain('If no category is appropriate, use "(no category)"');
        });

        it('should generate correct user prompt for budget type', () => {
            const prompt = getUserPrompt('budget', transactions, validBudgets);

            expect(prompt).toContain(
                'Assign the most appropriate budget to each transaction below.'
            );
            expect(prompt).toContain('Available budgets:');
            expect(prompt).toContain('- Food');
            expect(prompt).toContain('- Medical');
            expect(prompt).toContain('Transactions to budget:');
            expect(prompt).toContain('1. Walmart Supercenter - $150.00');
            expect(prompt).toContain('If no budget is appropriate, use "(no budget)"');
        });

        it('should handle single transaction', () => {
            const prompt = getUserPrompt('category', [transactions[0]], validCategories);

            expect(prompt).toContain('1. Walmart Supercenter');
            expect(prompt).not.toContain('2.');
        });

        it('should handle transactions with null/undefined fields', () => {
            const txWithNulls: LLMTransactionData[] = [
                {
                    description: 'Test Transaction',
                    amount: '100.00',
                    date: '2025-01-15',
                    source_account: null,
                    destination_account: undefined,
                    type: 'withdrawal',
                    notes: null,
                },
            ];

            const prompt = getUserPrompt('category', txWithNulls, validCategories);

            expect(prompt).toContain(
                '1. Test Transaction - $100.00 - 2025-01-15 (null → undefined)'
            );
        });

        it('should format multiple transactions with correct numbering', () => {
            const manyTransactions: LLMTransactionData[] = Array.from({ length: 5 }, (_, i) => ({
                description: `Transaction ${i + 1}`,
                amount: `${(i + 1) * 10}.00`,
                date: '2025-01-15',
                source_account: 'Checking',
                destination_account: 'Destination',
                type: 'withdrawal',
            }));

            const prompt = getUserPrompt('category', manyTransactions, validCategories);

            expect(prompt).toContain('1. Transaction 1 - $10.00');
            expect(prompt).toContain('2. Transaction 2 - $20.00');
            expect(prompt).toContain('3. Transaction 3 - $30.00');
            expect(prompt).toContain('4. Transaction 4 - $40.00');
            expect(prompt).toContain('5. Transaction 5 - $50.00');
        });
    });

    describe('parseAssignmentResponse', () => {
        const validCategories = ['Groceries', 'Healthcare', 'Shopping', '(no category)'];
        const validBudgets = ['Food', 'Medical', 'Shopping', '(no budget)'];

        describe('successful parsing', () => {
            it('should parse valid category response', () => {
                const response = JSON.stringify({
                    categories: ['Groceries', 'Healthcare', 'Shopping'],
                });

                const result = parseAssignmentResponse('category', response, 3, validCategories);

                expect(result).toEqual(['Groceries', 'Healthcare', 'Shopping']);
            });

            it('should parse valid budget response', () => {
                const response = JSON.stringify({
                    budgets: ['Food', 'Medical', 'Shopping'],
                });

                const result = parseAssignmentResponse('budget', response, 3, validBudgets);

                expect(result).toEqual(['Food', 'Medical', 'Shopping']);
            });

            it('should handle response with (no category) values', () => {
                const response = JSON.stringify({
                    categories: ['Groceries', '(no category)', 'Shopping'],
                });

                const result = parseAssignmentResponse('category', response, 3, validCategories);

                expect(result).toEqual(['Groceries', '(no category)', 'Shopping']);
            });

            it('should handle response with all (no budget) values', () => {
                const response = JSON.stringify({
                    budgets: ['(no budget)', '(no budget)', '(no budget)'],
                });

                const result = parseAssignmentResponse('budget', response, 3, validBudgets);

                expect(result).toEqual(['(no budget)', '(no budget)', '(no budget)']);
            });

            it('should parse single assignment', () => {
                const response = JSON.stringify({
                    categories: ['Groceries'],
                });

                const result = parseAssignmentResponse('category', response, 1, validCategories);

                expect(result).toEqual(['Groceries']);
            });
        });

        describe('validation errors', () => {
            it('should throw error for invalid JSON', () => {
                const response = 'Invalid JSON {]';

                expect(() =>
                    parseAssignmentResponse('category', response, 3, validCategories)
                ).toThrow('Failed to parse category assignment response');
            });

            it('should throw error when response is missing categories array', () => {
                const response = JSON.stringify({
                    wrong_field: ['Groceries', 'Healthcare'],
                });

                expect(() =>
                    parseAssignmentResponse('category', response, 2, validCategories)
                ).toThrow('Response does not contain a categories array');
            });

            it('should throw error when response is missing budgets array', () => {
                const response = JSON.stringify({
                    categories: ['Food', 'Medical'],
                });

                expect(() => parseAssignmentResponse('budget', response, 2, validBudgets)).toThrow(
                    'Response does not contain a budgets array'
                );
            });

            it('should throw error when field is not an array', () => {
                const response = JSON.stringify({
                    categories: 'not an array',
                });

                expect(() =>
                    parseAssignmentResponse('category', response, 3, validCategories)
                ).toThrow('Response does not contain a categories array');
            });

            it('should throw error when count mismatch - too few', () => {
                const response = JSON.stringify({
                    categories: ['Groceries', 'Healthcare'],
                });

                expect(() =>
                    parseAssignmentResponse('category', response, 3, validCategories)
                ).toThrow('Expected 3 categories, got 2');
            });

            it('should throw error when count mismatch - too many', () => {
                const response = JSON.stringify({
                    categories: ['Groceries', 'Healthcare', 'Shopping', 'Groceries'],
                });

                expect(() =>
                    parseAssignmentResponse('category', response, 3, validCategories)
                ).toThrow('Expected 3 categories, got 4');
            });

            it('should throw error when category is not in valid options', () => {
                const response = JSON.stringify({
                    categories: ['InvalidCategory', 'Healthcare', 'Shopping'],
                });

                expect(() =>
                    parseAssignmentResponse('category', response, 3, validCategories)
                ).toThrow('Invalid category at index 0: "InvalidCategory"');
            });

            it('should throw error when budget is not in valid options', () => {
                const response = JSON.stringify({
                    budgets: ['Food', 'InvalidBudget', 'Shopping'],
                });

                expect(() => parseAssignmentResponse('budget', response, 3, validBudgets)).toThrow(
                    'Invalid budget at index 1: "InvalidBudget"'
                );
            });

            it('should throw error for null response', () => {
                const response = 'null';

                expect(() =>
                    parseAssignmentResponse('category', response, 3, validCategories)
                ).toThrow('Failed to parse category assignment response');
            });

            it('should throw error for empty object', () => {
                const response = JSON.stringify({});

                expect(() =>
                    parseAssignmentResponse('category', response, 3, validCategories)
                ).toThrow('Response does not contain a categories array');
            });

            it('should throw error for empty array response', () => {
                const response = JSON.stringify({
                    categories: [],
                });

                expect(() =>
                    parseAssignmentResponse('category', response, 3, validCategories)
                ).toThrow('Expected 3 categories, got 0');
            });
        });

        describe('edge cases', () => {
            it('should handle empty response string', () => {
                const response = '';

                expect(() =>
                    parseAssignmentResponse('category', response, 3, validCategories)
                ).toThrow('Failed to parse category assignment response');
            });

            it('should handle response with extra fields', () => {
                const response = JSON.stringify({
                    categories: ['Groceries', 'Healthcare', 'Shopping'],
                    extra_field: 'should be ignored',
                    metadata: { count: 3 },
                });

                const result = parseAssignmentResponse('category', response, 3, validCategories);

                expect(result).toEqual(['Groceries', 'Healthcare', 'Shopping']);
            });

            it('should handle case-insensitive category matching', () => {
                const response = JSON.stringify({
                    categories: ['groceries', 'HEALTHCARE', 'Shopping'],
                });

                const result = parseAssignmentResponse('category', response, 3, validCategories);

                // Should normalize to the exact case from validCategories
                expect(result).toEqual(['Groceries', 'Healthcare', 'Shopping']);
            });

            it('should handle whitespace in response', () => {
                // The valid option has no whitespace, response has extra space
                const response = JSON.stringify({
                    categories: ['Groceries ', ' Healthcare', '  Shopping  '],
                });

                const result = parseAssignmentResponse('category', response, 3, validCategories);

                // Should trim and match correctly
                expect(result).toEqual(['Groceries', 'Healthcare', 'Shopping']);
            });

            it('should handle mixed case and whitespace variations', () => {
                const response = JSON.stringify({
                    categories: [' GROCERIES ', '  healthcare', 'ShOpPiNg '],
                });

                const result = parseAssignmentResponse('category', response, 3, validCategories);

                // Should normalize all variations to exact matches
                expect(result).toEqual(['Groceries', 'Healthcare', 'Shopping']);
            });

            it('should throw error for truly invalid category after normalization', () => {
                const response = JSON.stringify({
                    categories: ['InvalidCategory', 'Healthcare', 'Shopping'],
                });

                expect(() =>
                    parseAssignmentResponse('category', response, 3, validCategories)
                ).toThrow('Invalid category at index 0: "InvalidCategory"');
            });
        });
    });
});
