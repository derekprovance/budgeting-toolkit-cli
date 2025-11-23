import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TransactionSplitService } from '../../src/services/transaction-split.service.js';
import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs.js';
import { TransactionRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ILogger } from '../../src/types/interface/logger.interface.js';

describe('TransactionSplitService', () => {
    let service: TransactionSplitService;
    let mockClient: jest.Mocked<FireflyClientWithCerts>;
    let mockLogger: jest.Mocked<ILogger>;

    const createMockTransaction = (overrides?: Partial<TransactionSplit>): TransactionRead => ({
        type: 'transactions',
        id: '123',
        attributes: {
            transactions: [
                {
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
                },
            ],
        },
    });

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as jest.Mocked<ILogger>;

        mockClient = {
            transactions: {
                getTransaction: jest.fn(),
                updateTransaction: jest.fn(),
            },
        } as unknown as jest.Mocked<FireflyClientWithCerts>;

        service = new TransactionSplitService(mockClient, mockLogger);
    });

    describe('getTransaction', () => {
        it('should fetch transaction by ID', async () => {
            const mockTransaction = createMockTransaction();
            mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });

            const result = await service.getTransaction('123');

            expect(result).toEqual(mockTransaction);
            expect(mockClient.transactions.getTransaction).toHaveBeenCalledWith('123');
        });

        it('should return undefined when transaction not found', async () => {
            mockClient.transactions.getTransaction.mockResolvedValue({ data: undefined });

            const result = await service.getTransaction('999');

            expect(result).toBeUndefined();
        });

        it('should handle API errors gracefully', async () => {
            mockClient.transactions.getTransaction.mockRejectedValue(new Error('API Error'));

            const result = await service.getTransaction('123');

            expect(result).toBeUndefined();
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('validateSplitAmounts', () => {
        it('should validate exact match', () => {
            const result = service.validateSplitAmounts(100, [60, 40]);
            expect(result).toBe(true);
        });

        it('should accept amounts within EPSILON tolerance (0.01)', () => {
            const result = service.validateSplitAmounts(100, [60.005, 39.995]);
            expect(result).toBe(true);
        });

        it('should reject amounts exceeding EPSILON tolerance', () => {
            const result = service.validateSplitAmounts(100, [60, 41]);
            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should reject negative amounts', () => {
            const result = service.validateSplitAmounts(100, [60, -60]);
            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should reject zero amounts', () => {
            const result = service.validateSplitAmounts(100, [100, 0]);
            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle floating-point precision correctly', () => {
            // Classic floating-point issue: 0.1 + 0.2 !== 0.3
            const result = service.validateSplitAmounts(10.1, [3.37, 6.73]);
            expect(result).toBe(true);
        });
    });

    describe('splitTransaction', () => {
        it('should split transaction successfully', async () => {
            const mockTransaction = createMockTransaction();
            mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
            mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

            const result = await service.splitTransaction(
                '123',
                '60.00',
                { amount: '60.00', description: 'Test Transaction - Part 1' },
                { amount: '40.00', description: 'Test Transaction - Part 2' }
            );

            expect(result.success).toBe(true);
            expect(result.transaction).toEqual(mockTransaction);
            expect(mockClient.transactions.updateTransaction).toHaveBeenCalled();
        });

        it('should throw error when transaction not found', async () => {
            mockClient.transactions.getTransaction.mockResolvedValue({ data: undefined });

            const result = await service.splitTransaction(
                '999',
                '60.00',
                { amount: '60.00' },
                { amount: '40.00' }
            );

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toContain('not found');
        });

        it('should throw error when transaction has no splits', async () => {
            const mockTransaction = {
                ...createMockTransaction(),
                attributes: { transactions: [] },
            };
            mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });

            const result = await service.splitTransaction(
                '123',
                '60.00',
                { amount: '60.00' },
                { amount: '40.00' }
            );

            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('no splits');
        });

        it('should throw error when transaction already split (>1 splits)', async () => {
            const mockSplit = createMockTransaction().attributes.transactions[0];
            const mockTransaction = {
                ...createMockTransaction(),
                attributes: {
                    transactions: [mockSplit, { ...mockSplit, transaction_journal_id: 'journal-456' }],
                },
            };
            mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });

            const result = await service.splitTransaction(
                '123',
                '60.00',
                { amount: '60.00' },
                { amount: '40.00' }
            );

            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('already has');
        });

        it('should throw error when split amounts do not sum to original', async () => {
            const mockTransaction = createMockTransaction();
            mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });

            const result = await service.splitTransaction(
                '123',
                '60.00',
                { amount: '60.00' },
                { amount: '50.00' } // Sum is 110, not 100
            );

            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('do not equal');
        });

        describe('metadata handling', () => {
            it('should copy category from original to split 1 when not customized', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' }, // No categoryName
                    { amount: '40.00', description: 'Part 2' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[0].category_name).toBe('Groceries');
            });

            it('should copy budget from original to split 1 when not customized', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' }, // No budgetId
                    { amount: '40.00', description: 'Part 2' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[0].budget_id).toBe('budget-1');
            });

            it('should copy tags from original to split 1', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[0].tags).toEqual(['shopping', 'food']);
            });

            it('should use custom category for split 1 when provided', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1', categoryName: 'Custom Category' },
                    { amount: '40.00', description: 'Part 2' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[0].category_name).toBe('Custom Category');
            });

            it('should use custom budget for split 1 when provided', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1', budgetId: 'custom-budget' },
                    { amount: '40.00', description: 'Part 2' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[0].budget_id).toBe('custom-budget');
            });

            it('should leave category undefined for split 2 by default', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' } // No categoryName
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[1].category_name).toBeUndefined();
            });

            it('should leave budget undefined for split 2 by default', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' } // No budgetId
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[1].budget_id).toBeUndefined();
            });

            it('should set category for split 2 when provided', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2', categoryName: 'Split 2 Category' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[1].category_name).toBe('Split 2 Category');
            });

            it('should set budget for split 2 when provided', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2', budgetId: 'split-2-budget' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[1].budget_id).toBe('split-2-budget');
            });

            it('should not copy tags to split 2', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[1].tags).toBeUndefined();
            });
        });

        describe('currency handling', () => {
            it('should copy currency_id to split 2', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[1].currency_id).toBe('curr-1');
            });

            it('should copy currency_code to split 2', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[1].currency_code).toBe('USD');
            });

            it('should handle missing currency fields', async () => {
                const mockTransaction = createMockTransaction({
                    currency_id: undefined,
                    currency_code: undefined,
                });
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[1].currency_id).toBeUndefined();
                expect(payload.transactions[1].currency_code).toBeUndefined();
            });
        });

        describe('description handling', () => {
            it('should use original description when no custom text', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00' }, // No description
                    { amount: '40.00' } // No description
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[0].description).toBe('Test Transaction');
                expect(payload.transactions[1].description).toBe('Test Transaction');
            });

            it('should use custom description when provided', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00', description: 'Custom Part 1' },
                    { amount: '40.00', description: 'Custom Part 2' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[0].description).toBe('Custom Part 1');
                expect(payload.transactions[1].description).toBe('Custom Part 2');
            });

            it('should set group_title to original description', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00' },
                    { amount: '40.00' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.group_title).toBe('Test Transaction');
            });
        });

        describe('payload structure', () => {
            it('should include transaction_journal_id for split 1', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00' },
                    { amount: '40.00' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[0].transaction_journal_id).toBe('journal-123');
            });

            it('should not include transaction_journal_id for split 2', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00' },
                    { amount: '40.00' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.transactions[1].transaction_journal_id).toBeUndefined();
            });

            it('should set apply_rules: true', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00' },
                    { amount: '40.00' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.apply_rules).toBe(true);
            });

            it('should set fire_webhooks: true', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00' },
                    { amount: '40.00' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.fire_webhooks).toBe(true);
            });

            it('should include all required fields for split 2', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });
                mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

                await service.splitTransaction(
                    '123',
                    '60.00',
                    { amount: '60.00' },
                    { amount: '40.00' }
                );

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const split2 = updateCall[1].transactions[1];

                expect(split2.type).toBe('withdrawal');
                expect(split2.date).toBe('2024-01-15');
                expect(split2.amount).toBe('40.00');
                expect(split2.source_id).toBe('source-1');
                expect(split2.destination_id).toBe('dest-1');
            });
        });
    });
});
