import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TransactionSplitService } from '../../src/services/transaction-split.service.js';
import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs.js';
import { TransactionRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { createMockFireflyClient, createMockLogger } from '../shared/mocks.js';
import { transactionRead, withdrawal } from '../shared/test-data.js';

type UpdatePayload = Parameters<FireflyClientWithCerts['transactions']['updateTransaction']>[1];

/** The splits sent to Firefly; fails loudly rather than letting a missing array pass. */
const sentSplits = (payload: UpdatePayload) => {
    if (!payload.transactions) {
        throw new Error('update payload carried no transactions');
    }
    return payload.transactions;
};

/** The one split of a single-split transaction */
const onlySplit = (transaction: TransactionRead): TransactionSplit =>
    transaction.attributes.transactions[0];

/** Transaction 123: a withdrawal carrying the metadata the first split keeps */
const createMockTransaction = ({
    amount = '100.00',
    ...overrides
}: Partial<Omit<TransactionSplit, 'type'>> = {}): TransactionRead =>
    transactionRead(
        '123',
        withdrawal(amount, {
            transaction_journal_id: 'journal-123',
            date: '2024-01-15',
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
        })
    );

describe('TransactionSplitService', () => {
    let service: TransactionSplitService;
    let mockClient: jest.Mocked<FireflyClientWithCerts>;

    beforeEach(() => {
        mockClient = createMockFireflyClient();
        service = new TransactionSplitService(mockClient, createMockLogger());
    });

    describe('getSingleSplit', () => {
        it('should return the only split of the transaction', async () => {
            const mockTransaction = createMockTransaction();
            mockClient.transactions.getTransaction.mockResolvedValue({ data: mockTransaction });

            const split = await service.getSingleSplit('123');

            expect(split).toEqual(onlySplit(mockTransaction));
            expect(mockClient.transactions.getTransaction).toHaveBeenCalledWith('123');
        });

        it('should throw when the transaction is not found', async () => {
            mockClient.transactions.getTransaction.mockResolvedValue({
                data: undefined as unknown as TransactionRead,
            });

            await expect(service.getSingleSplit('999')).rejects.toThrow(
                'Transaction 999 not found'
            );
        });

        it('should throw when the transaction has no splits', async () => {
            mockClient.transactions.getTransaction.mockResolvedValue({
                data: { ...createMockTransaction(), attributes: { transactions: [] } },
            });

            await expect(service.getSingleSplit('123')).rejects.toThrow(
                'Transaction 123 has no splits'
            );
        });

        it('should throw when the transaction is already split', async () => {
            const split = onlySplit(createMockTransaction());
            mockClient.transactions.getTransaction.mockResolvedValue({
                data: {
                    ...createMockTransaction(),
                    attributes: {
                        transactions: [split, { ...split, transaction_journal_id: 'journal-456' }],
                    },
                },
            });

            await expect(service.getSingleSplit('123')).rejects.toThrow(
                'Transaction 123 already has 2 splits. Only single transactions can be split.'
            );
        });

        // A 401, certificate or network failure must not read as "not found"
        it('should report a Firefly failure as itself, keeping it as cause', async () => {
            const fireflyError = new Error('Unauthenticated');
            mockClient.transactions.getTransaction.mockRejectedValue(fireflyError);

            const failure = service.getSingleSplit('123');

            await expect(failure).rejects.toThrow(
                'Failed to fetch transaction 123: Unauthenticated'
            );
            await expect(failure).rejects.toMatchObject({ cause: fireflyError });
        });
    });

    describe('splitTransaction', () => {
        it('should split transaction successfully', async () => {
            const mockTransaction = createMockTransaction();
            mockClient.transactions.updateTransaction.mockResolvedValue({ data: mockTransaction });

            const result = await service.splitTransaction('123', onlySplit(mockTransaction), [
                { amount: '60.00', description: 'Test Transaction - Part 1' },
                { amount: '40.00', description: 'Test Transaction - Part 2' },
            ]);

            expect(result).toEqual(mockTransaction);
            expect(mockClient.transactions.updateTransaction).toHaveBeenCalled();
        });

        it('should throw with the transaction id, keeping the Firefly error as cause, when the update fails', async () => {
            const mockTransaction = createMockTransaction();
            const fireflyError = new Error('Unauthenticated');
            mockClient.transactions.updateTransaction.mockRejectedValue(fireflyError);

            const failure = service.splitTransaction('123', onlySplit(mockTransaction), [
                { amount: '60.00', description: 'Part 1' },
                { amount: '40.00', description: 'Part 2' },
            ]);

            await expect(failure).rejects.toThrow(
                'Failed to split transaction 123: Unauthenticated'
            );
            await expect(failure).rejects.toMatchObject({ cause: fireflyError });
        });

        describe('metadata handling', () => {
            it('should copy category from original to split 1 when not customized', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' }, // No categoryName
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[0].category_name).toBe('Groceries');
            });

            it('should copy budget from original to split 1 when not customized', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' }, // No budgetId
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[0].budget_id).toBe('budget-1');
            });

            it('should copy tags from original to split 1', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[0].tags).toEqual(['shopping', 'food']);
            });

            it('should leave category undefined for split 2 by default', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' }, // No categoryName
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[1].category_name).toBeUndefined();
            });

            it('should leave budget undefined for split 2 by default', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' }, // No budgetId
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[1].budget_id).toBeUndefined();
            });

            it('should not copy tags to split 2', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[1].tags).toBeUndefined();
            });
        });

        describe('currency handling', () => {
            it('should copy currency_id to split 2', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[1].currency_id).toBe('curr-1');
            });

            it('should copy currency_code to split 2', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[1].currency_code).toBe('USD');
            });

            it('should handle missing currency fields', async () => {
                const mockTransaction = createMockTransaction({
                    currency_id: undefined,
                    currency_code: undefined,
                });
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[1].currency_id).toBeUndefined();
                expect(sentSplits(payload)[1].currency_code).toBeUndefined();
            });

            it('should divide the foreign amount in proportion across both splits', async () => {
                const mockTransaction = createMockTransaction({
                    amount: '110.00',
                    foreign_amount: '100.00',
                    foreign_currency_id: 'curr-2',
                    foreign_currency_code: 'EUR',
                });
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '66.00', description: 'Part 1' },
                    { amount: '44.00', description: 'Part 2' },
                ]);

                const [first, second] = sentSplits(
                    mockClient.transactions.updateTransaction.mock.calls[0][1]
                );
                expect(first).toMatchObject({
                    foreign_amount: '60.00',
                    foreign_currency_id: 'curr-2',
                    foreign_currency_code: 'EUR',
                });
                expect(second).toMatchObject({
                    foreign_amount: '40.00',
                    foreign_currency_id: 'curr-2',
                    foreign_currency_code: 'EUR',
                });
            });

            it('should put the rounding remainder on split 2 so the foreign parts sum exactly', async () => {
                const mockTransaction = createMockTransaction({
                    amount: '100.00',
                    foreign_amount: '10.00',
                    foreign_currency_code: 'EUR',
                });
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '33.33', description: 'Part 1' },
                    { amount: '66.67', description: 'Part 2' },
                ]);

                const [first, second] = sentSplits(
                    mockClient.transactions.updateTransaction.mock.calls[0][1]
                );
                expect(first.foreign_amount).toBe('3.33');
                expect(second.foreign_amount).toBe('6.67');
            });

            it('should split a foreign amount in its own smallest unit', async () => {
                // JPY has no minor unit: 1000 yen splits 333 / 667, not 333.33
                const mockTransaction = createMockTransaction({
                    amount: '9.00',
                    foreign_amount: '1000',
                    foreign_currency_code: 'JPY',
                    foreign_currency_decimal_places: 0,
                });
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '3.00', description: 'Part 1' },
                    { amount: '6.00', description: 'Part 2' },
                ]);

                const [first, second] = sentSplits(
                    mockClient.transactions.updateTransaction.mock.calls[0][1]
                );
                expect(first.foreign_amount).toBe('333');
                expect(second.foreign_amount).toBe('667');
            });

            it('should send no foreign amount when the original has none', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                for (const split of sentSplits(
                    mockClient.transactions.updateTransaction.mock.calls[0][1]
                )) {
                    expect(split).not.toHaveProperty('foreign_amount');
                    expect(split).not.toHaveProperty('foreign_currency_code');
                }
            });
        });

        describe('description handling', () => {
            it('should use custom description when provided', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Custom Part 1' },
                    { amount: '40.00', description: 'Custom Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[0].description).toBe('Custom Part 1');
                expect(sentSplits(payload)[1].description).toBe('Custom Part 2');
            });

            it('should set group_title to original description', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.group_title).toBe('Test Transaction');
            });
        });

        describe('payload structure', () => {
            it('should include transaction_journal_id for split 1', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[0].transaction_journal_id).toBe('journal-123');
            });

            it('should not include transaction_journal_id for split 2', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(sentSplits(payload)[1].transaction_journal_id).toBeUndefined();
            });

            it('should set apply_rules: true', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.apply_rules).toBe(true);
            });

            it('should set fire_webhooks: true', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const payload = updateCall[1];
                expect(payload.fire_webhooks).toBe(true);
            });

            it('should include all required fields for split 2', async () => {
                const mockTransaction = createMockTransaction();
                mockClient.transactions.updateTransaction.mockResolvedValue({
                    data: mockTransaction,
                });

                await service.splitTransaction('123', onlySplit(mockTransaction), [
                    { amount: '60.00', description: 'Part 1' },
                    { amount: '40.00', description: 'Part 2' },
                ]);

                const updateCall = mockClient.transactions.updateTransaction.mock.calls[0];
                const split2 = sentSplits(updateCall[1])[1];

                expect(split2.type).toBe('withdrawal');
                expect(split2.date).toBe('2024-01-15');
                expect(split2.amount).toBe('40.00');
                expect(split2.source_id).toBe('source-1');
                expect(split2.destination_id).toBe('dest-1');
            });
        });
    });
});
