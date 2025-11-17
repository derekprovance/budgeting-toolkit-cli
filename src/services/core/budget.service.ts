import {
    BudgetLimitRead,
    BudgetRead,
    InsightGroup,
    TransactionRead,
    TransactionSplit,
} from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs';
import { DateRangeService } from '../../types/interface/date-range.service.interface';
import { DateUtils } from '../../utils/date.utils';
import { BudgetService as IBudgetService } from '../../types/interface/budget.service.interface';

export class BudgetService implements IBudgetService {
    constructor(private readonly client: FireflyClientWithCerts) {}

    async getBudgets(): Promise<BudgetRead[]> {
        const budgets = await this.fetchBudgets();
        return budgets.filter(budget => budget.attributes.active);
    }

    async getBudgetExpenseInsights(month: number, year: number): Promise<InsightGroup> {
        try {
            DateUtils.validateMonthYear(month, year);
            const range = DateRangeService.getDateRange(month, year);

            const results = await this.client.insight.insightExpenseBudget(
                range.startDate.toISOString().split('T')[0],
                range.endDate.toISOString().split('T')[0]
            );
            if (!results) {
                throw new Error('Failed to fetch expense insights for budget');
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

            const results = await this.client.budgets.listBudgetLimit(
                range.startDate.toISOString().split('T')[0],
                range.endDate.toISOString().split('T')[0]
            );
            if (!results || !results.data) {
                throw new Error('Failed to fetch expense insights for budget');
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
