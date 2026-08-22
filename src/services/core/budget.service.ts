import {
    BudgetLimitRead,
    BudgetRead,
    InsightGroup,
    TransactionSplit,
} from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { IDateRangeService } from '../../types/interface/date-range.service.interface.js';
import { DateUtils } from '../../utils/date.utils.js';
import { IBudgetService } from './budget.service.interface.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';
import { fetchAllPages, PAGE_SIZE } from '../../utils/pagination.utils.js';
import { logger } from '../../logger.js';

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
                range.startDateString,
                range.endDateString
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
                range.startDateString,
                range.endDateString
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

        // The SDK's listBudgetLimit exposes no page parameter, so a month with
        // more budget limits than one page holds cannot be drained here. Say so
        // loudly rather than silently reporting a short allocation total.
        const totalPages = results.meta?.pagination?.total_pages;
        if (totalPages !== undefined && totalPages > 1) {
            logger.warn(
                {
                    month,
                    year,
                    totalPages,
                    returned: results.data.length,
                    total: results.meta?.pagination?.total,
                },
                'Budget limits span multiple pages but the API client cannot request them - allocation total is incomplete'
            );
        }

        return results.data;
    }

    async getTransactionsWithoutBudget(month: number, year: number): Promise<TransactionSplit[]> {
        DateUtils.validateMonthYear(month, year);
        const range = this.dateRangeService.getDateRange(month, year);
        const data = await fetchAllPages(
            page =>
                this.client.budgets.listTransactionWithoutBudget(
                    undefined, // xTraceId
                    PAGE_SIZE,
                    page,
                    range.startDateString,
                    range.endDateString
                ),
            `fetch transactions without budget for month: ${month}`
        );
        return TransactionCalculationUtils.flattenTransactions(data);
    }

    private async fetchBudgets(): Promise<BudgetRead[]> {
        return fetchAllPages(
            page => this.client.budgets.listBudget(undefined, PAGE_SIZE, page),
            'fetch budgets'
        );
    }
}
