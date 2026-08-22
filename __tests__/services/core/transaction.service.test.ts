import { PAGE_SIZE } from '../../../src/utils/pagination.utils.js';
import '../../setup/mock-logger.js'; // Must be first to mock logger module
import { mockLogger, resetMockLogger } from '../../setup/mock-logger.js';
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
import { IDateRangeService } from '../../../src/types/interface/date-range.service.interface.js';
import {
    createMockExcludedTransactionService,
    createMockFireflyClient,
} from '../../setup/mock-services.js';

describe('TransactionService', () => {
    let service: TransactionService;
    let mockExcludedTransactionService: jest.Mocked<ExcludedTransactionService>;
    let mockApiClient: jest.Mocked<FireflyClientWithCerts>;
    let mockDateRangeService: jest.Mocked<IDateRangeService>;

    beforeEach(() => {
        resetMockLogger();
        mockExcludedTransactionService = createMockExcludedTransactionService();
        mockApiClient = createMockFireflyClient();
        mockDateRangeService = {
            getDateRange: jest.fn().mockReturnValue({
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-31'),
                startDateString: '2024-01-01',
                endDateString: '2024-01-31',
            }),
        } as jest.Mocked<IDateRangeService>;
        service = new TransactionService(
            mockExcludedTransactionService,
            mockApiClient,
            mockDateRangeService,
            new Map(),
            mockLogger
        );
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

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: mockTransactions,
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            const result = await service.getTransactionsByTag('test-tag');

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                transaction_journal_id: '1',
                description: 'Test Transaction 1',
                date: '2024-01-01',
                type: 'withdrawal',
            });
            expect(mockApiClient.tags.listTransactionByTag).toHaveBeenCalledWith(
                'test-tag',
                undefined,
                PAGE_SIZE,
                1
            );
        });

        it('should throw error when tag is empty', async () => {
            await expect(service.getTransactionsByTag('')).rejects.toThrow(
                'Tag parameter is required'
            );
        });

        it('should throw error when API call fails', async () => {
            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockRejectedValueOnce(
                new Error('API Error')
            );

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
            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            // Call getTransactionsByTag to populate the index
            await service.getTransactionsByTag('test-tag');

            // Mock the updateTransaction response
            (mockApiClient.transactions.updateTransaction as jest.Mock).mockResolvedValueOnce({
                data: mockTransactionRead,
            });

            // Now call updateTransaction
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
            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [],
                meta: {},
                links: {},
            } as TransactionArray);

            const result = await service.updateTransaction(mockTransaction, 'New Category');

            expect(mockLogger.error).toHaveBeenCalledWith(
                {
                    transactionId: '1',
                    description: 'Test Transaction',
                },
                'Unable to find Transaction ID for Split'
            );
            expect(result).toBeUndefined();
        });

        it('should throw TransactionError when API update fails', async () => {
            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            await service.getTransactionsByTag('test-tag');

            (mockApiClient.transactions.updateTransaction as jest.Mock).mockRejectedValueOnce(
                new Error('API Error')
            );

            const result = await service.updateTransaction(mockTransaction, 'New Category');

            expect(result).toBeUndefined();
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('getTransactionsForMonth', () => {
        it('should fetch and return transactions for a given month', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '100.00',
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    created_at: '2024-01-15T10:00:00Z',
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            const result = await service.getTransactionsForMonth(1, 2024);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal',
                amount: '100.00',
            });
        });

        it('should flatten nested transaction splits', async () => {
            const mockTransactions: TransactionSplit[] = [
                {
                    transaction_journal_id: '1',
                    description: 'Transaction 1',
                    date: '2024-01-15',
                    type: 'withdrawal' as TransactionTypeProperty,
                } as TransactionSplit,
                {
                    transaction_journal_id: '2',
                    description: 'Transaction 2',
                    date: '2024-01-16',
                    type: 'deposit' as TransactionTypeProperty,
                } as TransactionSplit,
            ];

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: mockTransactions,
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            const result = await service.getTransactionsForMonth(1, 2024);

            expect(result).toHaveLength(2);
            expect(result[0].transaction_journal_id).toBe('1');
            expect(result[1].transaction_journal_id).toBe('2');
        });

        it('should populate split transaction index', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: 'read-1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            await service.getTransactionsForMonth(1, 2024);

            const result = service.getTransactionReadBySplit(mockTransaction);
            expect(result).toEqual(mockTransactionRead);
        });

        it('should filter excluded transactions via ExcludedTransactionService', async () => {
            const excludedTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'VANGUARD BUY INVESTMENT',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '4400.00',
            } as TransactionSplit;

            const includedTransaction: TransactionSplit = {
                transaction_journal_id: '2',
                description: 'Regular Expense',
                date: '2024-01-16',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '50.00',
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [excludedTransaction, includedTransaction],
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockImplementation(
                (desc, amount) => {
                    return desc === 'VANGUARD BUY INVESTMENT' && amount === '4400.00';
                }
            );

            const result = await service.getTransactionsForMonth(1, 2024);

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Regular Expense');
        });

        it('should use cache on subsequent calls with same month/year', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            // First call should fetch from API
            await service.getTransactionsForMonth(1, 2024);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(1);

            // Second call should use cache
            await service.getTransactionsForMonth(1, 2024);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(1);
        });

        it('should not add excluded transactions to split index', async () => {
            const excludedTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'VANGUARD BUY INVESTMENT',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '4400.00',
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: 'read-1',
                attributes: {
                    transactions: [excludedTransaction],
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(true);

            await service.getTransactionsForMonth(1, 2024);

            const result = service.getTransactionReadBySplit(excludedTransaction);
            expect(result).toBeUndefined();
        });

        it('should throw error when API call fails', async () => {
            (mockApiClient.transactions.listTransaction as jest.Mock).mockRejectedValueOnce(
                new Error('API Error')
            );

            await expect(service.getTransactionsForMonth(1, 2024)).rejects.toThrow(
                'Failed to fetch transactions for month 1'
            );
        });

        it('should handle error with proper context', async () => {
            (mockApiClient.transactions.listTransaction as jest.Mock).mockRejectedValueOnce(
                new Error('Network Error')
            );

            await expect(service.getTransactionsForMonth(6, 2024)).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('getMostRecentTransactionDate', () => {
        it('should return date from most recent transaction', async () => {
            const mockTransaction: TransactionRead = {
                id: '1',
                attributes: {
                    created_at: '2024-01-15T10:30:00Z',
                    transactions: [],
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [mockTransaction],
            } as TransactionArray);

            const result = await service.getMostRecentTransactionDate();

            expect(result).toEqual(new Date('2024-01-15T10:30:00Z'));
        });

        it('should return null when created_at is undefined', async () => {
            const mockTransaction: TransactionRead = {
                id: '1',
                attributes: {
                    created_at: undefined,
                    transactions: [],
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [mockTransaction],
            } as TransactionArray);

            const result = await service.getMostRecentTransactionDate();

            expect(result).toBeNull();
        });

        it('should return null when created_at is null', async () => {
            const mockTransaction: TransactionRead = {
                id: '1',
                attributes: {
                    created_at: null,
                    transactions: [],
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [mockTransaction],
            } as TransactionArray);

            const result = await service.getMostRecentTransactionDate();

            expect(result).toBeNull();
        });

        it('should throw error when API returns empty data array', async () => {
            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [],
            } as TransactionArray);

            await expect(service.getMostRecentTransactionDate()).rejects.toThrow(
                'Failed to fetch transactions'
            );
        });

        it('should throw error when response is undefined', async () => {
            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce(
                undefined
            );

            await expect(service.getMostRecentTransactionDate()).rejects.toThrow(
                'Failed to fetch transactions'
            );
        });

        it('should throw error when response data is undefined', async () => {
            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: undefined,
            } as TransactionArray);

            await expect(service.getMostRecentTransactionDate()).rejects.toThrow(
                'Failed to fetch transactions'
            );
        });

        it('should handle API errors gracefully', async () => {
            (mockApiClient.transactions.listTransaction as jest.Mock).mockRejectedValueOnce(
                new Error('Network Error')
            );

            await expect(service.getMostRecentTransactionDate()).rejects.toThrow();
        });
    });

    describe('tagExists', () => {
        it('should return true when tag exists', async () => {
            (mockApiClient.tags.getTag as jest.Mock).mockResolvedValueOnce({
                data: { id: '1', attributes: { name: 'test-tag' } },
            });

            const result = await service.tagExists('test-tag');

            expect(result).toBe(true);
        });

        it('should return false when tag does not exist (API throws)', async () => {
            (mockApiClient.tags.getTag as jest.Mock).mockRejectedValueOnce(
                new Error('Tag not found')
            );

            const result = await service.tagExists('nonexistent-tag');

            expect(result).toBe(false);
        });

        it('should return false for empty tag string', async () => {
            (mockApiClient.tags.getTag as jest.Mock).mockRejectedValueOnce(
                new Error('Invalid tag')
            );

            const result = await service.tagExists('');

            expect(result).toBe(false);
            expect(mockApiClient.tags.getTag).toHaveBeenCalledWith('');
        });

        it('should handle API errors gracefully', async () => {
            (mockApiClient.tags.getTag as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

            const result = await service.tagExists('test-tag');

            expect(result).toBe(false);
        });

        it('should return false when API returns undefined data', async () => {
            (mockApiClient.tags.getTag as jest.Mock).mockResolvedValueOnce({
                data: undefined,
            });

            const result = await service.tagExists('test-tag');

            expect(result).toBe(false);
        });
    });

    describe('getTransactionReadBySplit', () => {
        it('should return TransactionRead when split exists in index', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: 'read-1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            // Populate index via getTransactionsByTag
            await service.getTransactionsByTag('test-tag');

            const result = service.getTransactionReadBySplit(mockTransaction);

            expect(result).toEqual(mockTransactionRead);
        });

        it('should return undefined when split not in index', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '999',
                description: 'Nonexistent Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const result = service.getTransactionReadBySplit(mockTransaction);

            expect(result).toBeUndefined();
        });

        it('should handle undefined transaction_journal_id', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: undefined,
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const result = service.getTransactionReadBySplit(mockTransaction);

            expect(result).toBeUndefined();
        });

        it('should use correct key format for lookup', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '123',
                description: 'Description with spaces',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: 'read-1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            await service.getTransactionsByTag('test-tag');

            // Lookup with exact same transaction
            const result = service.getTransactionReadBySplit(mockTransaction);
            expect(result).toEqual(mockTransactionRead);

            // Lookup with different date should fail
            const differentTransaction: TransactionSplit = {
                ...mockTransaction,
                date: '2024-01-16',
            };
            const resultDifferent = service.getTransactionReadBySplit(differentTransaction);
            expect(resultDifferent).toBeUndefined();
        });
    });

    describe('ExcludedTransactionService Integration', () => {
        it('should exclude transactions matching description and amount', async () => {
            const excludedTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'VANGUARD BUY INVESTMENT',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '4400.00',
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [excludedTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockImplementation(
                (desc, amount) => {
                    return desc === 'VANGUARD BUY INVESTMENT' && amount === '4400.00';
                }
            );

            const result = await service.getTransactionsByTag('test-tag');

            expect(result).toHaveLength(0);
        });

        it('should exclude transactions matching description only', async () => {
            const excludedTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Excluded Description',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '100.00',
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [excludedTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockImplementation(desc => {
                return desc === 'Excluded Description';
            });

            const result = await service.getTransactionsByTag('test-tag');

            expect(result).toHaveLength(0);
        });

        it('should exclude transactions matching amount only', async () => {
            const excludedTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Any Description',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '999.99',
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [excludedTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockImplementation((_, amount) => {
                return amount === '999.99';
            });

            const result = await service.getTransactionsByTag('test-tag');

            expect(result).toHaveLength(0);
        });

        it('should include transactions not matching any exclusion criteria', async () => {
            const includedTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Regular Expense',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '50.00',
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [includedTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            const result = await service.getTransactionsByTag('test-tag');

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Regular Expense');
        });

        it('should handle mixed excluded and included transactions', async () => {
            const excludedTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'VANGUARD BUY INVESTMENT',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '4400.00',
            } as TransactionSplit;

            const includedTransaction1: TransactionSplit = {
                transaction_journal_id: '2',
                description: 'Groceries',
                date: '2024-01-16',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '75.50',
            } as TransactionSplit;

            const includedTransaction2: TransactionSplit = {
                transaction_journal_id: '3',
                description: 'Salary Deposit',
                date: '2024-01-17',
                type: 'deposit' as TransactionTypeProperty,
                amount: '3000.00',
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [excludedTransaction, includedTransaction1, includedTransaction2],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockImplementation(
                (desc, amount) => {
                    return desc === 'VANGUARD BUY INVESTMENT' && amount === '4400.00';
                }
            );

            const result = await service.getTransactionsByTag('test-tag');

            expect(result).toHaveLength(2);
            expect(result.map(t => t.description)).toEqual(['Groceries', 'Salary Deposit']);
        });

        it('should handle null/undefined amounts in exclusion check', async () => {
            const transactionWithNullAmount: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: null as unknown as string,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [transactionWithNullAmount],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            const result = await service.getTransactionsByTag('test-tag');

            expect(result).toHaveLength(1);
        });

        it('should handle empty descriptions in exclusion check', async () => {
            const transactionWithEmptyDesc: TransactionSplit = {
                transaction_journal_id: '1',
                description: '',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
                amount: '50.00',
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [transactionWithEmptyDesc],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            const result = await service.getTransactionsByTag('test-tag');

            expect(result).toHaveLength(1);
        });
    });

    describe('Cache Management', () => {
        it('should return cached data on subsequent calls (cache hit)', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            // First call
            const result1 = await service.getTransactionsByTag('test-tag');

            // Second call should use cache
            const result2 = await service.getTransactionsByTag('test-tag');

            expect(result1).toEqual(result2);
            expect(mockApiClient.tags.listTransactionByTag).toHaveBeenCalledTimes(1);
        });

        it('should not call API when cache hit occurs', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            // First call
            await service.getTransactionsByTag('test-tag');
            expect(mockApiClient.tags.listTransactionByTag).toHaveBeenCalledTimes(1);

            // Second call should not make API call
            await service.getTransactionsByTag('test-tag');
            expect(mockApiClient.tags.listTransactionByTag).toHaveBeenCalledTimes(1);
        });

        it('should share one API fetch across concurrent callers (no stampede)', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValue({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

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
            (mockApiClient.transactions.listTransaction as jest.Mock)
                .mockRejectedValueOnce(new Error('network down'))
                .mockResolvedValueOnce({ data: [] } as unknown as TransactionArray);

            await expect(service.getTransactionsForMonth(1, 2024)).rejects.toThrow();

            // Retry after failure should hit the API again and succeed
            await expect(service.getTransactionsForMonth(1, 2024)).resolves.toEqual([]);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(2);
        });

        it('should use different cache keys for different months', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.transactions.listTransaction as jest.Mock)
                .mockResolvedValueOnce({
                    data: [mockTransactionRead],
                } as TransactionArray)
                .mockResolvedValueOnce({
                    data: [mockTransactionRead],
                } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            // Fetch for January
            await service.getTransactionsForMonth(1, 2024);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(1);

            // Fetch for February should make another API call
            await service.getTransactionsForMonth(2, 2024);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(2);
        });

        it('should use different cache keys for tags vs months', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            // Fetch by tag
            const tagResult = await service.getTransactionsByTag('test-tag');

            // Fetch by month
            const monthResult = await service.getTransactionsForMonth(1, 2024);

            // Both should succeed without cache collision
            expect(tagResult).toHaveLength(1);
            expect(monthResult).toHaveLength(1);
            expect(mockApiClient.tags.listTransactionByTag).toHaveBeenCalledTimes(1);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(1);
        });

        it('should populate cache after successful API fetch', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: '1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            const mockCache = new Map();
            const serviceWithCache = new TransactionService(
                mockExcludedTransactionService,
                mockApiClient,
                mockDateRangeService,
                mockCache
            );

            await serviceWithCache.getTransactionsByTag('test-tag');

            expect(mockCache.size).toBe(1);
            expect(mockCache.has('tag-test-tag')).toBe(true);
        });

        it('should populate split index alongside cache', async () => {
            const mockTransaction: TransactionSplit = {
                transaction_journal_id: '1',
                description: 'Test Transaction',
                date: '2024-01-15',
                type: 'withdrawal' as TransactionTypeProperty,
            } as TransactionSplit;

            const mockTransactionRead: TransactionRead = {
                id: 'read-1',
                attributes: {
                    transactions: [mockTransaction],
                },
            } as TransactionRead;

            (mockApiClient.tags.listTransactionByTag as jest.Mock).mockResolvedValueOnce({
                data: [mockTransactionRead],
            } as TransactionArray);

            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            const mockCache = new Map();
            const serviceWithCache = new TransactionService(
                mockExcludedTransactionService,
                mockApiClient,
                mockDateRangeService,
                mockCache
            );

            await serviceWithCache.getTransactionsByTag('test-tag');

            // Verify cache is populated
            expect(mockCache.size).toBe(1);

            // Verify split index is populated
            const indexedTransaction = serviceWithCache.getTransactionReadBySplit(mockTransaction);
            expect(indexedTransaction).toEqual(mockTransactionRead);
        });
    });

    describe('pagination and exclusions', () => {
        const split = (id: string, amount: string, budgetId?: string) =>
            ({
                transaction_journal_id: id,
                description: `txn-${id}`,
                amount,
                date: '2024-01-15',
                type: 'withdrawal',
                budget_id: budgetId,
            }) as unknown as TransactionSplit;

        const group = (splits: TransactionSplit[]) =>
            ({
                id: splits[0].transaction_journal_id,
                attributes: { transactions: splits },
            }) as unknown as TransactionRead;

        it('should fetch every page, not just the first', async () => {
            // Firefly defaults to 50 items per page; reading only response.data
            // silently truncates any busy month
            (mockApiClient.transactions.listTransaction as jest.Mock).mockImplementation((async (
                _trace: unknown,
                _limit: number,
                page: number
            ) => ({
                data: [group([split(`p${page}`, '10.00')])],
                meta: { pagination: { current_page: page, total_pages: 3 } },
            })) as never);

            const result = await service.getTransactionsForMonth(1, 2024);

            expect(result).toHaveLength(3);
            expect(result.map(t => t.transaction_journal_id)).toEqual(['p1', 'p2', 'p3']);
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(3);
        });

        it('should request a page size instead of relying on the API default', async () => {
            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValue({
                data: [],
                meta: { pagination: { current_page: 1, total_pages: 1 } },
            } as never);

            await service.getTransactionsForMonth(1, 2024);

            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledWith(
                undefined,
                PAGE_SIZE,
                1,
                '2024-01-01',
                '2024-01-31'
            );
        });

        it('should expose the transactions the exclusion list removed', async () => {
            const kept = split('1', '10.00');
            const dropped = split('2', '99.00', 'budget-7');

            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValue({
                data: [group([kept, dropped])],
                meta: { pagination: { current_page: 1, total_pages: 1 } },
            } as never);
            mockExcludedTransactionService.isExcludedTransaction.mockImplementation(
                (description: string) => description === 'txn-2'
            );

            const included = await service.getTransactionsForMonth(1, 2024);
            const excluded = await service.getExcludedTransactionsForMonth(1, 2024);

            expect(included.map(t => t.transaction_journal_id)).toEqual(['1']);
            expect(excluded.map(t => t.transaction_journal_id)).toEqual(['2']);
            // shares the cached fetch rather than hitting the API again
            expect(mockApiClient.transactions.listTransaction).toHaveBeenCalledTimes(1);
        });

        it('should report no exclusions when nothing was filtered', async () => {
            (mockApiClient.transactions.listTransaction as jest.Mock).mockResolvedValue({
                data: [group([split('1', '10.00')])],
                meta: { pagination: { current_page: 1, total_pages: 1 } },
            } as never);
            mockExcludedTransactionService.isExcludedTransaction.mockReturnValue(false);

            await expect(service.getExcludedTransactionsForMonth(1, 2024)).resolves.toEqual([]);
        });
    });
});
