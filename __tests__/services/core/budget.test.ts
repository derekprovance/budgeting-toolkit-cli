import { BudgetService } from '../../../src/services/core/budget.service';
import { BudgetArray, BudgetLimitArray, InsightGroup } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../../src/api/firefly-client-with-certs';

describe('BudgetService', () => {
    let budgetService: BudgetService;
    let mockApiClient: jest.Mocked<FireflyClientWithCerts>;

    beforeEach(() => {
        mockApiClient = {
            budgets: {
                listBudget: jest.fn(),
                listBudgetLimit: jest.fn(),
                listTransactionWithoutBudget: jest.fn(),
            },
            insight: {
                insightExpenseBudget: jest.fn(),
            },
        } as unknown as jest.Mocked<FireflyClientWithCerts>;
        budgetService = new BudgetService(mockApiClient);
    });

    describe('getBudgets', () => {
        it('should return active budgets', async () => {
            const mockBudgets: BudgetArray = {
                data: [
                    {
                        id: '1',
                        type: 'budgets',
                        attributes: {
                            name: 'Test Budget 1',
                            active: true,
                        },
                    },
                    {
                        id: '2',
                        type: 'budgets',
                        attributes: {
                            name: 'Test Budget 2',
                            active: false,
                        },
                    },
                ],
                meta: {
                    pagination: {
                        total: 2,
                        count: 2,
                        per_page: 10,
                        current_page: 1,
                        total_pages: 1,
                    },
                },
            };

            (mockApiClient.budgets.listBudget as jest.Mock).mockResolvedValue(mockBudgets);

            const result = await budgetService.getBudgets();

            expect(mockApiClient.budgets.listBudget).toHaveBeenCalled();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
            expect(result[0].attributes.name).toBe('Test Budget 1');
        });

        it('should throw error when API call fails', async () => {
            (mockApiClient.budgets.listBudget as jest.Mock).mockRejectedValue(
                new Error('Failed to fetch budgets')
            );

            await expect(budgetService.getBudgets()).rejects.toThrow('Failed to fetch budgets');
        });

        it('should throw error when API returns null', async () => {
            (mockApiClient.budgets.listBudget as jest.Mock).mockResolvedValue(null);

            await expect(budgetService.getBudgets()).rejects.toThrow('Failed to fetch budgets');
        });
    });

    describe('getBudgetExpenseInsights', () => {
        it('should return budget expense insights for given month and year', async () => {
            const mockInsights = [
                {
                    id: '1',
                    attributes: {
                        name: 'Test Insight',
                        amount: 100,
                    },
                },
            ] as unknown as InsightGroup;

            (mockApiClient.insight.insightExpenseBudget as jest.Mock).mockResolvedValue(
                mockInsights
            );

            const result = await budgetService.getBudgetExpenseInsights(3, 2024);

            expect(mockApiClient.insight.insightExpenseBudget).toHaveBeenCalled();
            expect(result).toEqual(mockInsights);
        });

        it('should throw error for invalid month', async () => {
            await expect(budgetService.getBudgetExpenseInsights(13, 2024)).rejects.toThrow();
        });

        it('should throw error when API call fails', async () => {
            (mockApiClient.insight.insightExpenseBudget as jest.Mock).mockRejectedValue(
                new Error('Failed to get budget expense insights for month 3')
            );

            await expect(budgetService.getBudgetExpenseInsights(3, 2024)).rejects.toThrow(
                'Failed to get budget expense insights for month 3'
            );
        });

        it('should throw error when API returns null', async () => {
            (mockApiClient.insight.insightExpenseBudget as jest.Mock).mockResolvedValue(null);

            await expect(budgetService.getBudgetExpenseInsights(3, 2024)).rejects.toThrow(
                'Failed to fetch expense insights for budget'
            );
        });

        it('should handle non-Error exceptions', async () => {
            (mockApiClient.insight.insightExpenseBudget as jest.Mock).mockRejectedValue(
                'Some non-error rejection'
            );

            await expect(budgetService.getBudgetExpenseInsights(3, 2024)).rejects.toThrow(
                'Failed to get budget expense insights for month 3'
            );
        });
    });

    describe('getBudgetLimits', () => {
        it('should return budget limits for given month and year', async () => {
            const mockLimits: BudgetLimitArray = {
                data: [
                    {
                        id: '1',
                        type: 'budget-limits',
                        attributes: {
                            amount: '1000',
                            start: '2024-03-01',
                            end: '2024-03-31',
                            budget_id: '1',
                        },
                    },
                ],
                meta: {
                    pagination: {
                        total: 1,
                        count: 1,
                        per_page: 10,
                        current_page: 1,
                        total_pages: 1,
                    },
                },
            };

            (mockApiClient.budgets.listBudgetLimit as jest.Mock).mockResolvedValue(mockLimits);

            const result = await budgetService.getBudgetLimits(3, 2024);

            expect(mockApiClient.budgets.listBudgetLimit).toHaveBeenCalled();
            expect(result).toEqual(mockLimits.data);
        });

        it('should throw error for invalid month', async () => {
            await expect(budgetService.getBudgetLimits(13, 2024)).rejects.toThrow();
        });

        it('should throw error when API call fails', async () => {
            (mockApiClient.budgets.listBudgetLimit as jest.Mock).mockRejectedValue(
                new Error('Failed to get budget limits for month 3')
            );

            await expect(budgetService.getBudgetLimits(3, 2024)).rejects.toThrow(
                'Failed to get budget limits for month 3'
            );
        });

        it('should throw error when API returns null', async () => {
            (mockApiClient.budgets.listBudgetLimit as jest.Mock).mockResolvedValue(null);

            await expect(budgetService.getBudgetLimits(3, 2024)).rejects.toThrow(
                'Failed to fetch expense insights for budget'
            );
        });

        it('should handle non-Error exceptions', async () => {
            (mockApiClient.budgets.listBudgetLimit as jest.Mock).mockRejectedValue(
                'Some non-error rejection'
            );

            await expect(budgetService.getBudgetLimits(3, 2024)).rejects.toThrow(
                'Failed to get budget limits for month 3'
            );
        });
    });
});
