import { PAGE_SIZE } from '../../../src/utils/pagination.utils.js';
import { jest } from '@jest/globals';
import { TransactionService } from '../../../src/services/core/transaction.service.js';
import {
    TransactionArray,
    TransactionRead,
    TransactionSplit,
    TransactionTypeProperty,
} from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../../src/api/firefly-client-with-certs.js';
import { ExcludedTransactionService } from '../../../src/services/excluded-transaction.service.js';
import {
    createMockExcludedTransactionService,
    createMockFireflyClient,
    createMockLogger,
} from '../../shared/mocks.js';
import {
    apiError,
    deposit,
    journaled,
    transactionRead,
    withdrawal,
} from '../../shared/test-data.js';
import { ILogger } from '../../../src/types/interface/logger.interface.js';

/** What the Firefly SDK throws for an HTTP error status */
// Partial Firefly responses: only the fields the service reads.
type TagSingleResponse = Awaited<ReturnType<FireflyClientWithCerts['tags']['getTag']>>;

/** A single-page list response; without pagination metadata it is the only page. */
const page = (...groups: TransactionRead[]) => ({ data: groups }) as TransactionArray;

describe('TransactionService', () => {
    let service: TransactionService;
    let mockExcludedTransactionService: jest.Mocked<ExcludedTransactionService>;
    let mockApiClient: jest.Mocked<FireflyClientWithCerts>;
    let mockLogger: jest.Mocked<ILogger>;

    beforeEach(() => {
        mockLogger = createMockLogger();
        mockExcludedTransactionService = createMockExcludedTransactionService();
        mockApiClient = createMockFireflyClient();
        service = new TransactionService(
            mockExcludedTransactionService,
            mockApiClient,
            new Map(),
            mockLogger
        );
    });

    /** Fetches `groups` by tag, which fills the split index `updateTransaction` reads */
    const indexByTag = async (...groups: TransactionRead[]) => {
        mockApiClient.tags.listTransactionByTag.mockResolvedValueOnce(page(...groups));
        await service.getTransactionsByTag('test-tag');
    };

    /** Excludes exactly the transactions with this description and amount */
    const excludeWhen = (description: string, amount?: string) =>
        mockExcludedTransactionService.isExcludedTransaction.mockImplementation(
            (desc, amt) => desc === description && (amount === undefined || amt === amount)
        );

    describe('getTransactionsByTag', () => {
        it('should return transactions for a given tag', async () => {
            const split = withdrawal(10, {
                transaction_journal_id: '1',
                description: 'Test Transaction 1',
            });
            mockApiClient.tags.listTransactionByTag.mockResolvedValueOnce(
                page(transactionRead('1', split))
            );

            const result = await service.getTransactionsByTag('test-tag');

            expect(result).toEqual([split]);
            expect(mockApiClient.tags.listTransactionByTag).toHaveBeenCalledWith(
                'test-tag',
                undefined,
                PAGE_SIZE,
                1
            );
        });

        it('should throw error when API call fails', async () => {
            mockApiClient.tags.listTransactionByTag.mockRejectedValueOnce(new Error('API Error'));

            await expect(service.getTransactionsByTag('test-tag')).rejects.toThrow(
                'Failed to fetch transactions by tag test-tag'
            );
        });
    });

    describe('updateTransaction', () => {
        const mockTransaction = journaled(
            withdrawal(10, { transaction_journal_id: '1', description: 'Test Transaction' })
        );
        const mockTransactionRead = transactionRead('1', mockTransaction);

        it('should update transaction with category and budget', async () => {
            await indexByTag(mockTransactionRead);
            mockApiClient.transactions.updateTransaction.mockResolvedValueOnce({
                data: mockTransactionRead,
            });

            await service.updateTransaction(mockTransaction, 'New Category', '2');

            expect(mockApiClient.transactions.updateTransaction).toHaveBeenCalledWith(
                '1',
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

        it('should throw error for unsupported transaction type', async () => {
            const invalidTransaction = {
                ...mockTransaction,
                type: 'invalid' as TransactionTypeProperty,
            };

            await expect(
                service.updateTransaction(invalidTransaction, 'New Category')
            ).rejects.toThrow('Unsupported transaction type invalid');
        });

        it('should throw when transaction read is not found', async () => {
            await expect(
                service.updateTransaction(mockTransaction, 'New Category')
            ).rejects.toThrow('Unable to find transaction ID for split 1');
            expect(mockApiClient.transactions.updateTransaction).not.toHaveBeenCalled();
        });

        it('should throw TransactionError when API update fails', async () => {
            await indexByTag(mockTransactionRead);
            mockApiClient.transactions.updateTransaction.mockRejectedValueOnce(
                new Error('API Error')
            );

            // A swallowed failure would be counted as a skip, never as a failure
            await expect(
                service.updateTransaction(mockTransaction, 'New Category')
            ).rejects.toThrow('API Error');
        });

        it('should list every split of a multi-split group so Firefly keeps them', async () => {
            const first = withdrawal(60, { transaction_journal_id: '10', description: 'Part A' });
            const target = journaled(
                withdrawal(40, { transaction_journal_id: '11', description: 'Part B' })
            );
            const third = withdrawal(5, { transaction_journal_id: '12', description: 'Part C' });
            const group = transactionRead('7', first, target, third);
            group.attributes.group_title = 'Costco';

            await indexByTag(group);
            mockApiClient.transactions.updateTransaction.mockResolvedValueOnce({ data: group });

            await service.updateTransaction(target, 'Groceries', '3');

            // Firefly 6.6.6 rejects a multi-split PUT without its group title
            expect(mockApiClient.transactions.updateTransaction).toHaveBeenCalledWith('7', {
                apply_rules: true,
                fire_webhooks: true,
                group_title: 'Costco',
                transactions: [
                    { transaction_journal_id: '10' },
                    { transaction_journal_id: '11', category_name: 'Groceries', budget_id: '3' },
                    { transaction_journal_id: '12' },
                ],
            });
        });
    });

    describe('getTransactionsForMonth', () => {
        it('should fetch and return transactions for a given month', async () => {
            const mockTransaction = withdrawal(100, {
                transaction_journal_id: '1',
                description: 'Test Transaction',
            });
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(
                page(transactionRead('1', mockTransaction))
            );

            const result = await service.getTransactionsForMonth(1, 2024);

            expect(result).toEqual([mockTransaction]);
        });

        it('should flatten nested transaction splits', async () => {
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(
                page(
                    transactionRead(
                        '1',
                        withdrawal(10, { transaction_journal_id: '1' }),
                        deposit(10, { transaction_journal_id: '2' })
                    )
                )
            );

            const result = await service.getTransactionsForMonth(1, 2024);

            expect(result).toHaveLength(2);
            expect(result[0].transaction_journal_id).toBe('1');
            expect(result[1].transaction_journal_id).toBe('2');
        });

        it('should populate split transaction index', async () => {
            const mockTransaction = withdrawal(10, { transaction_journal_id: '1' });
            const mockTransactionRead = transactionRead('read-1', mockTransaction);
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(
                page(mockTransactionRead)
            );

            await service.getTransactionsForMonth(1, 2024);

            const result = service.getTransactionReadBySplit(mockTransaction);
            expect(result).toEqual(mockTransactionRead);
        });

        it('should filter excluded transactions via ExcludedTransactionService', async () => {
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(
                page(
                    transactionRead(
                        '1',
                        withdrawal(2000, {
                            transaction_journal_id: '1',
                            description: 'BROKERAGE BUY INVESTMENT',
                        }),
                        withdrawal(50, {
                            transaction_journal_id: '2',
                            description: 'Regular Expense',
                        })
                    )
                )
            );
            excludeWhen('BROKERAGE BUY INVESTMENT', '2000.00');

            const result = await service.getTransactionsForMonth(1, 2024);

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Regular Expense');
        });

        it('should use cache on subsequent calls with same month/year', async () => {
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(
                page(transactionRead('1', withdrawal(10, { transaction_journal_id: '1' })))
            );

            await service.getTransactionsForMonth(1, 2024);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(1);

            await service.getTransactionsForMonth(1, 2024);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(1);
        });

        it('should not add excluded transactions to split index', async () => {
            const excludedTransaction = withdrawal(2000, {
                transaction_journal_id: '1',
                description: 'BROKERAGE BUY INVESTMENT',
            });
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(
                page(transactionRead('read-1', excludedTransaction))
            );
            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(true);

            await service.getTransactionsForMonth(1, 2024);

            const result = service.getTransactionReadBySplit(excludedTransaction);
            expect(result).toBeUndefined();
        });

        it('should throw error when API call fails', async () => {
            mockApiClient.transactions.listTransaction.mockRejectedValueOnce(
                new Error('API Error')
            );

            await expect(service.getTransactionsForMonth(1, 2024)).rejects.toThrow(
                'Failed to fetch transactions for month 1/2024: API Error'
            );
        });

        it('should handle error with proper context', async () => {
            mockApiClient.transactions.listTransaction.mockRejectedValueOnce(
                new Error('Network Error')
            );

            await expect(service.getTransactionsForMonth(6, 2024)).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('getTransactionsInRange', () => {
        it('requests the given inclusive range and follows pagination', async () => {
            const pageOfTwo = (id: string) =>
                ({
                    data: [transactionRead(id, withdrawal(1, { transaction_journal_id: id }))],
                    meta: { pagination: { total_pages: 2 } },
                }) as TransactionArray;
            mockApiClient.transactions.listTransaction
                .mockResolvedValueOnce(pageOfTwo('1'))
                .mockResolvedValueOnce(pageOfTwo('2'));

            const result = await service.getTransactionsInRange('2023-09-25', '2024-09-25');

            expect(result.map(t => t.transaction_journal_id)).toEqual(['1', '2']);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenNthCalledWith(
                1,
                undefined,
                expect.any(Number),
                1,
                '2023-09-25',
                '2024-09-25'
            );
            expect(mockApiClient.transactions.listTransaction).toHaveBeenNthCalledWith(
                2,
                undefined,
                expect.any(Number),
                2,
                '2023-09-25',
                '2024-09-25'
            );
        });
    });

    describe('getMostRecentTransactionDate', () => {
        const importedAt = (createdAt: string | null, group: TransactionRead) =>
            ({
                ...group,
                attributes: { ...group.attributes, created_at: createdAt },
            }) as TransactionRead;

        it('should return the transaction date, not the import timestamp', async () => {
            // The two differ whenever a backdated batch is imported, and
            // created_at would report the data as current as of the import --
            // the false reassurance this figure exists to prevent.
            const group = importedAt(
                '2024-03-02T09:00:00Z', // imported in March
                transactionRead('1', withdrawal(10, { date: '2024-01-15T10:30:00Z' }))
            );
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(page(group));

            const result = await service.getMostRecentTransactionDate();

            expect(result).toEqual(new Date('2024-01-15T10:30:00Z'));
        });

        it('should return undefined when the group carries no splits', async () => {
            const group = importedAt('2024-01-15T10:30:00Z', transactionRead('1'));
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(page(group));

            const result = await service.getMostRecentTransactionDate();

            expect(result).toBeUndefined();
        });

        it('should return undefined when created_at is null', async () => {
            const group = importedAt(null, transactionRead('1'));
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(page(group));

            const result = await service.getMostRecentTransactionDate();

            expect(result).toBeUndefined();
        });

        it('should return undefined for a ledger with no transactions', async () => {
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(page());

            const result = await service.getMostRecentTransactionDate();

            expect(result).toBeUndefined();
        });

        it('should throw error when response is undefined', async () => {
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(
                undefined as unknown as TransactionArray
            );

            await expect(service.getMostRecentTransactionDate()).rejects.toThrow(
                'Failed to fetch transactions'
            );
        });

        it('should throw error when response data is undefined', async () => {
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce({
                data: undefined,
            } as unknown as TransactionArray);

            await expect(service.getMostRecentTransactionDate()).rejects.toThrow(
                'Failed to fetch transactions'
            );
        });

        it('should handle API errors gracefully', async () => {
            mockApiClient.transactions.listTransaction.mockRejectedValueOnce(
                new Error('Network Error')
            );

            await expect(service.getMostRecentTransactionDate()).rejects.toThrow();
        });
    });

    describe('tagExists', () => {
        it('should return true when tag exists', async () => {
            mockApiClient.tags.getTag.mockResolvedValueOnce({
                data: { id: '1', attributes: { tag: 'test-tag' } },
            } as unknown as TagSingleResponse);

            const result = await service.tagExists('test-tag');

            expect(result).toBe(true);
        });

        it('should return false when Firefly has no such tag', async () => {
            mockApiClient.tags.getTag.mockRejectedValueOnce(apiError(404));

            const result = await service.tagExists('nonexistent-tag');

            expect(result).toBe(false);
        });

        it('should fail rather than report a tag missing when Firefly cannot be asked', async () => {
            mockApiClient.tags.getTag.mockRejectedValueOnce(apiError(401));

            await expect(service.tagExists('test-tag')).rejects.toThrow();
        });

        it('should fail on a network error', async () => {
            mockApiClient.tags.getTag.mockRejectedValueOnce(new Error('ECONNREFUSED'));

            await expect(service.tagExists('test-tag')).rejects.toThrow('ECONNREFUSED');
        });

        it('should return false when API returns undefined data', async () => {
            mockApiClient.tags.getTag.mockResolvedValueOnce({
                data: undefined,
            } as unknown as TagSingleResponse);

            const result = await service.tagExists('test-tag');

            expect(result).toBe(false);
        });
    });

    describe('getTransactionReadBySplit', () => {
        it('should return TransactionRead when split exists in index', async () => {
            const mockTransaction = withdrawal(10, { transaction_journal_id: '1' });
            const mockTransactionRead = transactionRead('read-1', mockTransaction);
            await indexByTag(mockTransactionRead);

            const result = service.getTransactionReadBySplit(mockTransaction);

            expect(result).toEqual(mockTransactionRead);
        });

        it('should return undefined when split not in index', async () => {
            const mockTransaction = withdrawal(10, {
                transaction_journal_id: '999',
                description: 'Nonexistent Transaction',
            });

            const result = service.getTransactionReadBySplit(mockTransaction);

            expect(result).toBeUndefined();
        });

        it('should handle undefined transaction_journal_id', async () => {
            const mockTransaction = withdrawal(10, { transaction_journal_id: undefined });

            const result = service.getTransactionReadBySplit(mockTransaction);

            expect(result).toBeUndefined();
        });

        it('should use correct key format for lookup', async () => {
            const mockTransaction = withdrawal(10, {
                transaction_journal_id: '123',
                description: 'Description with spaces',
                date: '2024-01-15',
            });
            const mockTransactionRead = transactionRead('read-1', mockTransaction);
            await indexByTag(mockTransactionRead);

            const result = service.getTransactionReadBySplit(mockTransaction);
            expect(result).toEqual(mockTransactionRead);

            const differentTransaction: TransactionSplit = {
                ...mockTransaction,
                date: '2024-01-16',
            };
            const resultDifferent = service.getTransactionReadBySplit(differentTransaction);
            expect(resultDifferent).toBeUndefined();
        });
    });

    describe('ExcludedTransactionService Integration', () => {
        /** Fetches one group of `splits` by tag */
        const fetchByTag = (...splits: TransactionSplit[]) => {
            mockApiClient.tags.listTransactionByTag.mockResolvedValueOnce(
                page(transactionRead('1', ...splits))
            );
            return service.getTransactionsByTag('test-tag');
        };

        it('should exclude transactions matching description and amount', async () => {
            excludeWhen('BROKERAGE BUY INVESTMENT', '2000.00');

            const result = await fetchByTag(
                withdrawal(2000, { description: 'BROKERAGE BUY INVESTMENT' })
            );

            expect(result).toHaveLength(0);
        });

        it('should exclude transactions matching description only', async () => {
            excludeWhen('Excluded Description');

            const result = await fetchByTag(
                withdrawal(100, { description: 'Excluded Description' })
            );

            expect(result).toHaveLength(0);
        });

        it('should exclude a transaction the service matches on description and amount', async () => {
            excludeWhen('Monthly Rent', '999.99');

            const result = await fetchByTag(withdrawal(999.99, { description: 'Monthly Rent' }));

            expect(result).toHaveLength(0);
        });

        it('should include transactions not matching any exclusion criteria', async () => {
            const result = await fetchByTag(withdrawal(50, { description: 'Regular Expense' }));

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Regular Expense');
        });

        it('should handle mixed excluded and included transactions', async () => {
            excludeWhen('BROKERAGE BUY INVESTMENT', '2000.00');

            const result = await fetchByTag(
                withdrawal(2000, {
                    transaction_journal_id: '1',
                    description: 'BROKERAGE BUY INVESTMENT',
                }),
                withdrawal(75.5, { transaction_journal_id: '2', description: 'Groceries' }),
                deposit(3000, { transaction_journal_id: '3', description: 'Salary Deposit' })
            );

            expect(result).toHaveLength(2);
            expect(result.map(t => t.description)).toEqual(['Groceries', 'Salary Deposit']);
        });

        it('should handle null/undefined amounts in exclusion check', async () => {
            const result = await fetchByTag({
                ...withdrawal(0),
                amount: null as unknown as string,
            });

            expect(result).toHaveLength(1);
        });

        it('should handle empty descriptions in exclusion check', async () => {
            const result = await fetchByTag(withdrawal(50, { description: '' }));

            expect(result).toHaveLength(1);
        });
    });

    describe('Cache Management', () => {
        const mockTransaction = withdrawal(10, { transaction_journal_id: '1' });

        it('should return cached data on subsequent calls (cache hit)', async () => {
            mockApiClient.tags.listTransactionByTag.mockResolvedValueOnce(
                page(transactionRead('1', mockTransaction))
            );

            const result1 = await service.getTransactionsByTag('test-tag');

            const result2 = await service.getTransactionsByTag('test-tag');

            expect(result1).toEqual(result2);
            expect(mockApiClient.tags.listTransactionByTag).toHaveBeenCalledTimes(1);
        });

        it('should not call API when cache hit occurs', async () => {
            mockApiClient.tags.listTransactionByTag.mockResolvedValueOnce(
                page(transactionRead('1', mockTransaction))
            );

            await service.getTransactionsByTag('test-tag');
            expect(mockApiClient.tags.listTransactionByTag).toHaveBeenCalledTimes(1);

            await service.getTransactionsByTag('test-tag');
            expect(mockApiClient.tags.listTransactionByTag).toHaveBeenCalledTimes(1);
        });

        it('should share one API fetch across concurrent callers (no stampede)', async () => {
            mockApiClient.transactions.listTransaction.mockResolvedValue(
                page(transactionRead('1', mockTransaction))
            );

            // Fire concurrent requests before any has resolved (analyze command pattern)
            const results = await Promise.all([
                service.getTransactionsForMonth(1, 2024),
                service.getTransactionsForMonth(1, 2024),
                service.getTransactionsForMonth(1, 2024),
            ]);

            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(1);
            expect(results[0]).toEqual(results[1]);
            expect(results[1]).toEqual(results[2]);
        });

        it('should not cache failed fetches', async () => {
            mockApiClient.transactions.listTransaction
                .mockRejectedValueOnce(new Error('network down'))
                .mockResolvedValueOnce(page());

            await expect(service.getTransactionsForMonth(1, 2024)).rejects.toThrow();

            await expect(service.getTransactionsForMonth(1, 2024)).resolves.toEqual([]);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(2);
        });

        it('should use different cache keys for different months', async () => {
            mockApiClient.transactions.listTransaction.mockResolvedValue(
                page(transactionRead('1', mockTransaction))
            );

            await service.getTransactionsForMonth(1, 2024);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(1);

            await service.getTransactionsForMonth(2, 2024);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(2);
        });

        it('should use different cache keys for tags vs months', async () => {
            const group = transactionRead('1', mockTransaction);
            mockApiClient.tags.listTransactionByTag.mockResolvedValueOnce(page(group));
            mockApiClient.transactions.listTransaction.mockResolvedValueOnce(page(group));

            const tagResult = await service.getTransactionsByTag('test-tag');

            const monthResult = await service.getTransactionsForMonth(1, 2024);

            expect(tagResult).toHaveLength(1);
            expect(monthResult).toHaveLength(1);
            expect(mockApiClient.tags.listTransactionByTag).toHaveBeenCalledTimes(1);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(1);
        });

        it('should populate cache after successful API fetch', async () => {
            mockApiClient.tags.listTransactionByTag.mockResolvedValueOnce(
                page(transactionRead('1', mockTransaction))
            );
            const mockCache = new Map();
            const serviceWithCache = new TransactionService(
                mockExcludedTransactionService,
                mockApiClient,
                mockCache
            );

            await serviceWithCache.getTransactionsByTag('test-tag');

            expect(mockCache.size).toBe(1);
            expect(mockCache.has('tag-test-tag')).toBe(true);
        });

        it('should populate split index alongside cache', async () => {
            const mockTransactionRead = transactionRead('read-1', mockTransaction);
            mockApiClient.tags.listTransactionByTag.mockResolvedValueOnce(
                page(mockTransactionRead)
            );
            const mockCache = new Map();
            const serviceWithCache = new TransactionService(
                mockExcludedTransactionService,
                mockApiClient,
                mockCache
            );

            await serviceWithCache.getTransactionsByTag('test-tag');

            expect(mockCache.size).toBe(1);

            const indexedTransaction = serviceWithCache.getTransactionReadBySplit(mockTransaction);
            expect(indexedTransaction).toEqual(mockTransactionRead);
        });
    });

    describe('pagination and exclusions', () => {
        const split = (id: string, amount: number, budgetId?: string) =>
            withdrawal(amount, {
                transaction_journal_id: id,
                description: `txn-${id}`,
                budget_id: budgetId,
            });

        it('should fetch every page, not just the first', async () => {
            // Firefly defaults to 50 items per page; reading only response.data
            // silently truncates any busy month
            // The SDK returns a CancelablePromise, which a plain async function is not
            mockApiClient.transactions.listTransaction.mockImplementation((async (
                _trace: unknown,
                _limit: number,
                pageNumber: number
            ) => ({
                data: [transactionRead(`p${pageNumber}`, split(`p${pageNumber}`, 10))],
                meta: { pagination: { current_page: pageNumber, total_pages: 3 } },
            })) as never);

            const result = await service.getTransactionsForMonth(1, 2024);

            expect(result).toHaveLength(3);
            expect(result.map(t => t.transaction_journal_id)).toEqual(['p1', 'p2', 'p3']);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(3);
        });

        it('should request a page size instead of relying on the API default', async () => {
            mockApiClient.transactions.listTransaction.mockResolvedValue(page());

            await service.getTransactionsForMonth(1, 2024);

            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledWith(
                undefined,
                PAGE_SIZE,
                1,
                '2024-01-01',
                '2024-01-31'
            );
        });

        it('[R-EXCL-1] should drop an excluded transaction once, at fetch', async () => {
            mockApiClient.transactions.listTransaction.mockResolvedValue(
                page(transactionRead('1', split('1', 10), split('2', 99, 'budget-7')))
            );
            excludeWhen('txn-2');

            const included = await service.getTransactionsForMonth(1, 2024);

            expect(included.map(t => t.transaction_journal_id)).toEqual(['1']);
        });
    });
});
