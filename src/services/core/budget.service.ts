import { BudgetLimitRead, BudgetRead } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { monthRange } from '../../utils/date.utils.js';
import { IBudgetService } from './budget.service.interface.js';
import { fetchAllPages, PAGE_SIZE } from '../../utils/pagination.utils.js';
import { logger } from '../../logger.js';
import { errorMessage } from '../../utils/error-detection.utils.js';

export class BudgetService implements IBudgetService {
    constructor(private readonly client: FireflyClientWithCerts) {}

    async getBudgets(includeInactive = false): Promise<BudgetRead[]> {
        const budgets = await this.fetchBudgets();
        return includeInactive ? budgets : budgets.filter(budget => budget.attributes.active);
    }

    async getBudgetLimits(month: number, year: number): Promise<BudgetLimitRead[]> {
        const { start, end } = monthRange(month, year);

        let results: Awaited<ReturnType<typeof this.client.budgets.listBudgetLimit>> | undefined;
        try {
            results = await this.client.budgets.listBudgetLimit(start, end);
        } catch (error) {
            throw new Error(
                `Failed to get budget limits for month ${month}: ${errorMessage(error)}`,
                { cause: error }
            );
        }

        if (!results?.data) {
            throw new Error(
                `Failed to get budget limits for month ${month}: API returned empty response`
            );
        }

        // The SDK's listBudgetLimit has no page parameter, so further pages
        // cannot be fetched; warn rather than silently under-report
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

    private async fetchBudgets(): Promise<BudgetRead[]> {
        return fetchAllPages(
            page => this.client.budgets.listBudget(undefined, PAGE_SIZE, page),
            'fetch budgets'
        );
    }
}

/**
 * Each budget's allocation for the period: the sum of its limits. A budget can
 * carry several limits in one month; an unparseable amount allocates nothing.
 * `analyze` and `report` both total allocations through here.
 */
export function allocationsByBudget(limits: BudgetLimitRead[]): Map<string, number> {
    const allocations = new Map<string, number>();
    for (const limit of limits) {
        const amount = Number(limit.attributes.amount);
        const budgetId = String(limit.attributes.budget_id);
        allocations.set(budgetId, (allocations.get(budgetId) ?? 0) + (isNaN(amount) ? 0 : amount));
    }
    return allocations;
}
