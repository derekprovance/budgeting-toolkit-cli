import { BudgetService } from '../../src/services/core/budget.service.js';
import {
    BudgetLimitRead,
    BudgetRead,
    InsightGroup,
    TransactionRead,
    TransactionSplit,
} from '@derekprovance/firefly-iii-sdk';
import { IDateRangeService } from '../../src/types/interface/date-range.service.interface.js';
import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs.js';
import { jest } from '@jest/globals';

describe('BudgetService', () => {
    let budgetService: BudgetService;
    let mockApiClient: jest.Mocked<FireflyClientWithCerts>;
    let mockDateRangeService: IDateRangeService;

    beforeEach(() => {
        mockApiClient = {
            budgets: {
                listBudget: jest.fn(),
                listBudgetLimit: jest.fn(),
                listTransactionWithoutBudget: jest.fn(),
                listTransactionByBudget: jest.fn(),
            },
            insight: {
                insightExpenseBudget: jest.fn(),
            },
        } as unknown as jest.Mocked<FireflyClientWithCerts>;

        mockDateRangeService = {
            getDateRange: jest.fn(),
        };

        budgetService = new BudgetService(mockApiClient, mockDateRangeService);
    });

    describe('getBudgets', () => {
        it('should return active budgets', async () => {
            const mockBudgets: BudgetRead[] = [
                {
                    id: '1',
                    attributes: { name: 'Budget 1', active: true },
                },
                {
                    id: '2',
                    attributes: { name: 'Budget 2', active: false },
                },
            ] as BudgetRead[];

            (mockApiClient.budgets.listBudget as jest.Mock).mockResolvedValueOnce({
                data: mockBudgets,
            });

            const result = await budgetService.getBudgets();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
            expect(result[0].attributes.name).toBe('Budget 1');
            expect(mockApiClient.budgets.listBudget).toHaveBeenCalled();
        });

        it('should throw error when API call fails', async () => {
            (mockApiClient.budgets.listBudget as jest.Mock).mockRejectedValueOnce(
                new Error('API Error')
            );

            await expect(budgetService.getBudgets()).rejects.toThrow('API Error');
        });
    });

    describe('getBudgetExpenseInsights', () => {
        it('should return budget expense insights', async () => {
            const mockStartDate = new Date('2024-01-01T00:00:00.000Z');
            const mockEndDate = new Date('2024-01-31T23:59:59.999Z');

            (mockDateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            const mockInsights = {
                data: [
                    {
                        id: '1',
                        difference_float: 100.0,
                    },
                ],
            } as unknown as InsightGroup;

            (mockApiClient.insight.insightExpenseBudget as jest.Mock).mockResolvedValueOnce(
                mockInsights
            );

            const result = await budgetService.getBudgetExpenseInsights(1, 2024);

            expect(result).toEqual(mockInsights);
            expect(mockApiClient.insight.insightExpenseBudget).toHaveBeenCalledWith(
                mockStartDate.toISOString().split('T')[0],
                mockEndDate.toISOString().split('T')[0]
            );
        });

        it('should format dates correctly in API call', async () => {
            const mockStartDate = new Date('2024-01-01T00:00:00.000Z');
            const mockEndDate = new Date('2024-01-31T23:59:59.999Z');

            (mockDateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            (mockApiClient.insight.insightExpenseBudget as jest.Mock).mockResolvedValueOnce(
                {} as InsightGroup
            );

            await budgetService.getBudgetExpenseInsights(1, 2024);

            expect(mockApiClient.insight.insightExpenseBudget).toHaveBeenCalledWith(
                mockStartDate.toISOString().split('T')[0],
                mockEndDate.toISOString().split('T')[0]
            );
        });

        it('should throw error when API call fails', async () => {
            (mockApiClient.insight.insightExpenseBudget as jest.Mock).mockRejectedValueOnce(
                new Error('API Error')
            );

            await expect(budgetService.getBudgetExpenseInsights(1, 2024)).rejects.toThrow(
                'Failed to get budget expense insights for month 1'
            );
        });

        it('should validate month and year', async () => {
            await expect(budgetService.getBudgetExpenseInsights(0, 2024)).rejects.toThrow();
            await expect(budgetService.getBudgetExpenseInsights(13, 2024)).rejects.toThrow();
        });
    });

    describe('getBudgetLimits', () => {
        it('should return budget limits', async () => {
            const mockStartDate = new Date('2024-01-01T00:00:00.000Z');
            const mockEndDate = new Date('2024-01-31T23:59:59.999Z');

            (mockDateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            const mockLimits: BudgetLimitRead[] = [
                {
                    id: '1',
                    attributes: { budget_id: '1', amount: '100.00' },
                },
            ] as BudgetLimitRead[];

            (mockApiClient.budgets.listBudgetLimit as jest.Mock).mockResolvedValueOnce({
                data: mockLimits,
            });

            const result = await budgetService.getBudgetLimits(1, 2024);

            expect(result).toEqual(mockLimits);
            expect(mockApiClient.budgets.listBudgetLimit).toHaveBeenCalled();
        });

        it('should format dates correctly in API call', async () => {
            const mockStartDate = new Date('2024-01-01T00:00:00.000Z');
            const mockEndDate = new Date('2024-01-31T23:59:59.999Z');

            (mockDateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            (mockApiClient.budgets.listBudgetLimit as jest.Mock).mockResolvedValueOnce({
                data: [],
            });

            await budgetService.getBudgetLimits(1, 2024);

            expect(mockApiClient.budgets.listBudgetLimit).toHaveBeenCalledWith(
                mockStartDate.toISOString().split('T')[0],
                mockEndDate.toISOString().split('T')[0]
            );
        });

        it('should throw error when API call fails', async () => {
            (mockApiClient.budgets.listBudgetLimit as jest.Mock).mockRejectedValueOnce(
                new Error('API Error')
            );

            await expect(budgetService.getBudgetLimits(1, 2024)).rejects.toThrow(
                'Failed to get budget limits for month 1'
            );
        });

        it('should validate month and year', async () => {
            await expect(budgetService.getBudgetLimits(0, 2024)).rejects.toThrow();
            await expect(budgetService.getBudgetLimits(13, 2024)).rejects.toThrow();
        });
    });

    describe('getTransactionsForBudget', () => {
        it('should return transactions for a specific budget', async () => {
            const mockStartDate = new Date('2024-01-01T00:00:00.000Z');
            const mockEndDate = new Date('2024-01-31T23:59:59.999Z');

            (mockDateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            const mockTransaction: TransactionSplit = {
                description: 'Test Transaction',
                amount: '100.00',
                currency_symbol: '$',
                date: '2024-01-15T00:00:00.000Z',
                transaction_journal_id: '1',
            } as TransactionSplit;

            const mockTransactions: TransactionRead[] = [
                {
                    id: '1',
                    attributes: {
                        transactions: [mockTransaction],
                    },
                } as TransactionRead,
            ];

            (mockApiClient.budgets.listTransactionByBudget as jest.Mock).mockResolvedValueOnce({
                data: mockTransactions,
            });

            const result = await budgetService.getTransactionsForBudget('budget-1', 1, 2024);

            expect(result).toHaveLength(1);
            expect(result[0].description).toBe('Test Transaction');
            expect(mockApiClient.budgets.listTransactionByBudget).toHaveBeenCalledWith(
                'budget-1',
                undefined,
                undefined,
                undefined,
                mockStartDate.toISOString().split('T')[0],
                mockEndDate.toISOString().split('T')[0]
            );
        });

        it('should return empty array when no transactions found', async () => {
            const mockStartDate = new Date('2024-01-01T00:00:00.000Z');
            const mockEndDate = new Date('2024-01-31T23:59:59.999Z');

            (mockDateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            (mockApiClient.budgets.listTransactionByBudget as jest.Mock).mockResolvedValueOnce({
                data: [],
            });

            const result = await budgetService.getTransactionsForBudget('budget-1', 1, 2024);

            expect(result).toEqual([]);
        });

        it('should throw error when API returns null', async () => {
            const mockStartDate = new Date('2024-01-01T00:00:00.000Z');
            const mockEndDate = new Date('2024-01-31T23:59:59.999Z');

            (mockDateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            (mockApiClient.budgets.listTransactionByBudget as jest.Mock).mockResolvedValueOnce(
                null
            );

            await expect(
                budgetService.getTransactionsForBudget('budget-1', 1, 2024)
            ).rejects.toThrow('Failed to fetch transactions for budget budget-1 in month 1/2024');
        });

        it('should throw error when API call fails', async () => {
            const mockStartDate = new Date('2024-01-01T00:00:00.000Z');
            const mockEndDate = new Date('2024-01-31T23:59:59.999Z');

            (mockDateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            (mockApiClient.budgets.listTransactionByBudget as jest.Mock).mockRejectedValueOnce(
                new Error('API Error')
            );

            await expect(
                budgetService.getTransactionsForBudget('budget-1', 1, 2024)
            ).rejects.toThrow('API Error');
        });

        it('should validate month and year', async () => {
            await expect(
                budgetService.getTransactionsForBudget('budget-1', 0, 2024)
            ).rejects.toThrow();
            await expect(
                budgetService.getTransactionsForBudget('budget-1', 13, 2024)
            ).rejects.toThrow();
        });

        it('should flatten multiple transaction splits correctly', async () => {
            const mockStartDate = new Date('2024-01-01T00:00:00.000Z');
            const mockEndDate = new Date('2024-01-31T23:59:59.999Z');

            (mockDateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            const mockTransaction1: TransactionSplit = {
                description: 'Transaction 1',
                amount: '50.00',
                currency_symbol: '$',
                date: '2024-01-15T00:00:00.000Z',
            } as TransactionSplit;

            const mockTransaction2: TransactionSplit = {
                description: 'Transaction 2',
                amount: '75.00',
                currency_symbol: '$',
                date: '2024-01-20T00:00:00.000Z',
            } as TransactionSplit;

            const mockTransactions: TransactionRead[] = [
                {
                    id: '1',
                    attributes: {
                        transactions: [mockTransaction1, mockTransaction2],
                    },
                } as TransactionRead,
            ];

            (mockApiClient.budgets.listTransactionByBudget as jest.Mock).mockResolvedValueOnce({
                data: mockTransactions,
            });

            const result = await budgetService.getTransactionsForBudget('budget-1', 1, 2024);

            expect(result).toHaveLength(2);
            expect(result[0].description).toBe('Transaction 1');
            expect(result[1].description).toBe('Transaction 2');
        });
    });
});
