import { BudgetService, allocationsByBudget } from '../../../src/services/core/budget.service.js';
import { BudgetArray, BudgetLimitArray, BudgetLimitRead } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../../src/api/firefly-client-with-certs.js';
import { jest } from '@jest/globals';
import { createMockFireflyClient } from '../../shared/mocks.js';

describe('BudgetService', () => {
    let budgetService: BudgetService;
    let mockApiClient: jest.Mocked<FireflyClientWithCerts>;

    beforeEach(() => {
        mockApiClient = createMockFireflyClient();
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

            jest.mocked(mockApiClient.budgets.listBudget).mockResolvedValue(mockBudgets);

            const result = await budgetService.getBudgets();

            expect(mockApiClient.budgets.listBudget).toHaveBeenCalled();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
            expect(result[0].attributes.name).toBe('Test Budget 1');

            // Opting in returns the inactive one too
            expect((await budgetService.getBudgets(true)).map(b => b.id)).toEqual(['1', '2']);
        });

        it('should throw error when API call fails', async () => {
            jest.mocked(mockApiClient.budgets.listBudget).mockRejectedValue(
                new Error('Failed to fetch budgets')
            );

            await expect(budgetService.getBudgets()).rejects.toThrow('Failed to fetch budgets');
        });

        it('should throw error when API returns null', async () => {
            jest.mocked(mockApiClient.budgets.listBudget).mockResolvedValue(null as never); // malformed API response

            await expect(budgetService.getBudgets()).rejects.toThrow('Failed to fetch budgets');
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

            jest.mocked(mockApiClient.budgets.listBudgetLimit).mockResolvedValue(mockLimits);

            const result = await budgetService.getBudgetLimits(3, 2024);

            expect(mockApiClient.budgets.listBudgetLimit).toHaveBeenCalled();
            expect(result).toEqual(mockLimits.data);
        });

        it('should throw error for invalid month', async () => {
            await expect(budgetService.getBudgetLimits(13, 2024)).rejects.toThrow();
        });

        it('should throw error when API call fails', async () => {
            jest.mocked(mockApiClient.budgets.listBudgetLimit).mockRejectedValue(
                new Error('Request failed with status code 401')
            );

            await expect(budgetService.getBudgetLimits(3, 2024)).rejects.toThrow(
                'Failed to get budget limits for month 3/2024: Request failed with status code 401'
            );
        });

        it('should throw error when API returns null', async () => {
            jest.mocked(mockApiClient.budgets.listBudgetLimit).mockResolvedValue(null as never); // malformed API response

            await expect(budgetService.getBudgetLimits(3, 2024)).rejects.toThrow(
                'Failed to get budget limits for month 3/2024: API returned empty response'
            );
        });

        it('should handle non-Error exceptions', async () => {
            jest.mocked(mockApiClient.budgets.listBudgetLimit).mockRejectedValue(
                'Some non-error rejection'
            );

            await expect(budgetService.getBudgetLimits(3, 2024)).rejects.toThrow(
                'Failed to get budget limits for month 3/2024: Some non-error rejection'
            );
        });
    });

    describe('allocationsByBudget', () => {
        const limit = (budgetId: string, amount: string) =>
            ({ attributes: { budget_id: budgetId, amount } }) as unknown as BudgetLimitRead;

        it('[R-BUDGET-1] should sum every limit a budget has in the period', () => {
            const allocations = allocationsByBudget([
                limit('1', '200'),
                limit('1', '200'),
                limit('2', '50.25'),
            ]);

            expect([...allocations]).toEqual([
                ['1', 400],
                ['2', 50.25],
            ]);
        });

        it('should allocate nothing for an unparseable amount', () => {
            expect(allocationsByBudget([limit('1', 'not a number')]).get('1')).toBe(0);
        });
    });
});
