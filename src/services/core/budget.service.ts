import {
    BudgetLimitRead,
    BudgetRead,
    InsightGroup,
    TransactionRead,
    TransactionSplit,
} from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { IDateRangeService } from '../../types/interface/date-range.service.interface.js';
import { DateUtils } from '../../utils/date.utils.js';
import { IBudgetService } from './budget.service.interface.js';

export class BudgetService implements IBudgetService {
    constructor(
        private readonly client: FireflyClientWithCerts,
        private readonly dateRangeService: IDateRangeService
    ) {}

    async getBudgets(): Promise<BudgetRead[]> {
        const budgets = await this.fetchBudgets();
        return budgets.filter(budget => budget.attributes.active);
    }

    async getBudgetExpenseInsights(month: number, year: number): Promise<InsightGroup> {
        DateUtils.validateMonthYear(month, year);
        const range = this.dateRangeService.getDateRange(month, year);

        let results: InsightGroup | undefined;
        try {
            results = await this.client.insight.insightExpenseBudget(
                range.startDate.toISOString().split('T')[0],
                range.endDate.toISOString().split('T')[0]
            );
        } catch (error) {
            throw new Error(
                `Failed to get budget expense insights for month ${month}: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error }
            );
        }

        if (!results) {
            throw new Error(
                `Failed to get budget expense insights for month ${month}: API returned empty response`
            );
        }
        return results;
    }

    async getBudgetLimits(month: number, year: number): Promise<BudgetLimitRead[]> {
        DateUtils.validateMonthYear(month, year);
        const range = this.dateRangeService.getDateRange(month, year);

        let results: Awaited<ReturnType<typeof this.client.budgets.listBudgetLimit>> | undefined;
        try {
            results = await this.client.budgets.listBudgetLimit(
                range.startDate.toISOString().split('T')[0],
                range.endDate.toISOString().split('T')[0]
            );
        } catch (error) {
            throw new Error(
                `Failed to get budget limits for month ${month}: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error }
            );
        }

        if (!results?.data) {
            throw new Error(
                `Failed to get budget limits for month ${month}: API returned empty response`
            );
        }
        return results.data;
    }

    async getTransactionsWithoutBudget(month: number, year: number): Promise<TransactionSplit[]> {
        const range = this.dateRangeService.getDateRange(month, year);
        const response = await this.client.budgets.listTransactionWithoutBudget(
            undefined, // xTraceId
            undefined, // limit
            undefined, // page
            range.startDate.toISOString().split('T')[0],
            range.endDate.toISOString().split('T')[0]
        );
        if (!response || !response.data) {
            throw new Error(`Failed to fetch transactions for month: ${month}`);
        }
        return this.flattenTransactions(response.data);
    }

    /**
     * Gets all transactions for a specific budget within a date range
     * @param budgetId The budget ID
     * @param month Month (1-12)
     * @param year Year
     * @returns Promise<TransactionSplit[]> Flattened transaction splits
     * @throws Error when month/year validation fails
     * @throws Error when API call fails or returns null/undefined
     */
    async getTransactionsForBudget(
        budgetId: string,
        month: number,
        year: number
    ): Promise<TransactionSplit[]> {
        DateUtils.validateMonthYear(month, year);
        const range = this.dateRangeService.getDateRange(month, year);

        const response = await this.client.budgets.listTransactionByBudget(
            budgetId,
            undefined, // xTraceId
            undefined, // limit
            undefined, // page
            range.startDate.toISOString().split('T')[0],
            range.endDate.toISOString().split('T')[0]
        );

        if (!response || !response.data) {
            throw new Error(
                `Failed to fetch transactions for budget ${budgetId} in month ${month}/${year}`
            );
        }

        return this.flattenTransactions(response.data);
    }

    private async fetchBudgets(): Promise<BudgetRead[]> {
        const results = await this.client.budgets.listBudget();
        if (!results || !results.data) {
            throw new Error('Failed to fetch budgets');
        }
        return results.data;
    }

    private flattenTransactions(transactions: TransactionRead[]): TransactionSplit[] {
        return transactions.flatMap(transaction => transaction.attributes?.transactions ?? []);
    }
}
