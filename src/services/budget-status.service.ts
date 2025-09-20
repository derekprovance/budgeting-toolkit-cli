import { BudgetStatusDto } from '../types/dto/budget-status.dto';
import { BudgetService } from './core/budget.service';
import { BudgetStatusService as IBudgetStatusService } from '../types/interface/budget-status.service.interface';
import { DateUtils } from '../utils/date.utils';
import { logger } from '../logger';

export class BudgetStatusService implements IBudgetStatusService {
    constructor(private budgetService: BudgetService) {}

    async getBudgetStatus(month: number, year: number): Promise<BudgetStatusDto[]> {
        try {
            DateUtils.validateMonthYear(month, year);
            const budgetStatuses: BudgetStatusDto[] = [];

            logger.debug(
                {
                    month,
                    year,
                },
                'Fetching budget status'
            );

            const budgets = await this.budgetService.getBudgets();
            const insights = await this.budgetService.getBudgetExpenseInsights(month, year);
            const budgetLimits = await this.budgetService.getBudgetLimits(month, year);

            logger.debug(
                {
                    budgetCount: budgets.length,
                    insightCount: insights.length,
                    limitCount: budgetLimits.length,
                },
                'Retrieved budget data'
            );

            budgets.forEach(budget => {
                const budgetName = budget.attributes.name;
                const budgetId = budget.id;

                const budgetLimit = budgetLimits.filter(
                    budgetLimit => budgetLimit.attributes.budget_id === budgetId
                )[0];
                const insight = insights.find(insight => insight.id == budgetId);

                budgetStatuses.push({
                    name: budgetName,
                    amount: budgetLimit ? Number(budgetLimit.attributes.amount) : 0.0,
                    spent: insight ? insight.difference_float : 0.0,
                } as BudgetStatusDto);
            });

            logger.debug(
                {
                    month,
                    year,
                    budgetCount: budgetStatuses.length,
                },
                'Budget status calculation complete'
            );

            return budgetStatuses;
        } catch (error) {
            logger.error(
                {
                    month,
                    year,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to get budget status'
            );
            if (error instanceof Error) {
                throw new Error(`Failed to get budget status for month ${month}: ${error.message}`);
            }
            throw new Error(`Failed to get budget status for month ${month}`);
        }
    }
}
