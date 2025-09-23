import {
    BudgetArray,
    BudgetLimitArray,
    BudgetLimitRead,
    BudgetRead,
    FireflyApiClient,
    FireflyApiError,
    InsightGroup,
    TransactionArray,
    TransactionRead,
    TransactionSplit,
} from '@derekprovance/firefly-iii-sdk';
import { DateRangeService } from '../../types/interface/date-range.service.interface';
import { DateUtils } from '../../utils/date.utils';
import { BudgetService as IBudgetService } from '../../types/interface/budget.service.interface';

export class BudgetService implements IBudgetService {
    constructor(private readonly apiClient: FireflyApiClient) {}

    async getBudgets(): Promise<BudgetRead[]> {
        const budgets = await this.fetchBudgets();
        return budgets.filter(budget => budget.attributes.active);
    }

    async getBudgetExpenseInsights(month: number, year: number): Promise<InsightGroup> {
        try {
            DateUtils.validateMonthYear(month, year);
            const range = DateRangeService.getDateRange(month, year);

            const results = await this.apiClient.get<InsightGroup>(
                `/insight/expense/budget?start=${range.startDate.toISOString()}&end=${range.endDate.toISOString()}`
            );
            if (!results) {
                throw new FireflyApiError('Failed to fetch expense insights for budget');
            }
            return results;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(
                    `Failed to get budget expense insights for month ${month}: ${error.message}`
                );
            }
            throw new Error(`Failed to get budget expense insights for month ${month}`);
        }
    }

    async getBudgetLimits(month: number, year: number): Promise<BudgetLimitRead[]> {
        try {
            DateUtils.validateMonthYear(month, year);
            const range = DateRangeService.getDateRange(month, year);

            const results = await this.apiClient.get<BudgetLimitArray>(
                `/budget-limits?start=${range.startDate.toISOString()}&end=${range.endDate.toISOString()}`
            );
            if (!results) {
                throw new FireflyApiError('Failed to fetch expense insights for budget');
            }
            return results.data;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to get budget limits for month ${month}: ${error.message}`);
            }
            throw new Error(`Failed to get budget limits for month ${month}`);
        }
    }

    async getTransactionsWithoutBudget(month: number, year: number): Promise<TransactionSplit[]> {
        const range = DateRangeService.getDateRange(month, year);
        const response = await this.apiClient.get<TransactionArray>(
            `/budgets/transactions-without-budget?start=${range.startDate.toISOString()}&end=${range.endDate.toISOString()}`
        );
        if (!response) {
            throw new FireflyApiError(`Failed to fetch transactions for month: ${month}`);
        }
        return this.flattenTransactions(response.data);
    }

    private async fetchBudgets(): Promise<BudgetRead[]> {
        const results = await this.apiClient.get<BudgetArray>(`/budgets`);
        if (!results) {
            throw new FireflyApiError('Failed to fetch budgets');
        }
        return results.data;
    }

    private flattenTransactions(transactions: TransactionRead[]): TransactionSplit[] {
        return transactions.flatMap(transaction => transaction.attributes?.transactions ?? []);
    }
}
