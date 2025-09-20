import { TransactionService } from '../../../src/services/core/transaction.service';
import {
    FireflyApiClient,
    TransactionArray,
    TransactionRead,
    TransactionSplit,
    TransactionTypeProperty,
} from '@derekprovance/firefly-iii-sdk';
import { logger } from '../../../src/logger';

jest.mock('@derekprovance/firefly-iii-sdk');
jest.mock('../../../src/logger', () => ({
    logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    },
}));

describe('TransactionService', () => {
    let service: TransactionService;
    let mockApiClient: jest.Mocked<FireflyApiClient>;

    beforeEach(() => {
        mockApiClient = {
            get: jest.fn(),
            put: jest.fn(),
        } as unknown as jest.Mocked<FireflyApiClient>;
        service = new TransactionService(mockApiClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getTransactionsByTag', () => {
        it('should return transactions for a given tag', async () => {
            const mockTransactions: TransactionRead[] = [
                {
                    id: '1',
                    attributes: {
                        transactions: [
                            {
                                transaction_journal_id: '1',
                                description: 'Test Transaction 1',
                                date: '2024-01-01',
                                type: 'withdrawal',
                            },
                        ],
                    },
                },
            ] as TransactionRead[];

            mockApiClient.get.mockResolvedValueOnce({
                data: mockTransactions,
            } as TransactionArray);

            const result = await service.getTransactionsByTag('test-tag');

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                transaction_journal_id: '1',
                description: 'Test Transaction 1',
                date: '2024-01-01',
                type: 'withdrawal',
            });
            expect(mockApiClient.get).toHaveBeenCalledWith('/tags/test-tag/transactions');
        });

        it('should throw error when tag is empty', async () => {
            await expect(service.getTransactionsByTag('')).rejects.toThrow(
                'Tag parameter is required'
            );
        });

        it('should throw error when API call fails', async () => {
            mockApiClient.get.mockRejectedValueOnce(new Error('API Error'));

            await expect(service.getTransactionsByTag('test-tag')).rejects.toThrow(
                'Failed to fetch transactions by tag test-tag'
            );
        });
    });

    describe('updateTransaction', () => {
        const mockTransaction: TransactionSplit = {
            transaction_journal_id: '1',
            description: 'Test Transaction',
            type: 'withdrawal' as TransactionTypeProperty,
            date: '2024-01-01',
        } as TransactionSplit;

        it('should update transaction with category and budget', async () => {
            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            // First, populate the transaction index by fetching transactions
            mockApiClient.get.mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            // Call getTransactionsByTag to populate the index
            await service.getTransactionsByTag('test-tag');

            // Reset the mock to avoid interference with updateTransaction
            mockApiClient.get.mockReset();

            // Now call updateTransaction
            await service.updateTransaction(mockTransaction, 'New Category', '2');

            expect(mockApiClient.put).toHaveBeenCalledWith(
                '/transactions/1',
                expect.objectContaining({
                    apply_rules: true,
                    fire_webhooks: true,
                    transactions: [
                        {
                            transaction_journal_id: '1',
                            category_name: 'New Category',
                            budget_id: '2',
                        },
                    ],
                })
            );
        });

        it('should throw error when transaction has no journal ID', async () => {
            const invalidTransaction = {
                ...mockTransaction,
                transaction_journal_id: undefined,
            };

            await expect(
                service.updateTransaction(invalidTransaction, 'New Category')
            ).rejects.toThrow('Invalid transaction: missing transaction_journal_id');
        });

        it('should throw error for unsupported transaction type', async () => {
            const invalidTransaction = {
                ...mockTransaction,
                type: 'invalid' as TransactionTypeProperty,
            };

            await expect(
                service.updateTransaction(invalidTransaction, 'New Category')
            ).rejects.toThrow('Unsupported transaction type invalid');
        });

        it('should handle error when transaction read is not found', async () => {
            mockApiClient.get.mockResolvedValueOnce({
                data: [],
                meta: {},
                links: {},
            } as TransactionArray);

            await service.updateTransaction(mockTransaction, 'New Category');

            expect(logger.error).toHaveBeenCalledWith(
                {
                    transactionId: '1',
                    description: 'Test Transaction',
                },
                'Unable to find Transaction ID for Split'
            );
        });
    });

    describe('clearCache', () => {
        it('should clear the transaction cache', () => {
            const mockCache = new Map();
            const mockSplitIndex = new Map();
            const serviceWithCache = new TransactionService(mockApiClient, mockCache);

            // @ts-expect-error - accessing private property for test
            serviceWithCache.splitTransactionIdx = mockSplitIndex;

            serviceWithCache.clearCache();

            expect(mockCache.size).toBe(0);
            expect(mockSplitIndex.size).toBe(0);
        });
    });
});
