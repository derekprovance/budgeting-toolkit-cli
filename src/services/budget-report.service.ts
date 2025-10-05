import { BudgetReportDto } from '../types/dto/budget-report.dto';
import { BudgetService } from './core/budget.service';
import { BudgetReportService as IBudgetReportService } from '../types/interface/budget-report.service.interface';
import { DateUtils } from '../utils/date.utils';
import { logger } from '../logger';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { TransactionPropertyService } from './core/transaction-property.service';

export class BudgetReportService implements IBudgetReportService {
    constructor(
        private budgetService: BudgetService,
        private readonly transactionPropertyService: TransactionPropertyService
    ) {}

    async getBudgetStatus(month: number, year: number): Promise<BudgetReportDto[]> {
        try {
            DateUtils.validateMonthYear(month, year);
            const budgetReports: BudgetReportDto[] = [];

            logger.debug(
                {
                    month,
                    year,
                },
                'Fetching budget report'
            );

            const budgets = await this.budgetService.getBudgets();
            const insights = await this.budgetService.getBudgetExpenseInsights(month, year);
            const budgetLimits = await this.budgetService.getBudgetLimits(month, year);

            budgets.forEach(budget => {
                const budgetName = budget.attributes.name;
                const budgetId = budget.id;

                const budgetLimit = budgetLimits.filter(
                    budgetLimit => budgetLimit.attributes.budget_id === budgetId
                )[0];
                const insight = insights.find(insight => insight.id == budgetId);

                budgetReports.push({
                    name: budgetName,
                    amount: budgetLimit ? Number(budgetLimit.attributes.amount) : 0.0,
                    spent: insight ? insight.difference_float : 0.0,
                } as BudgetReportDto);
            });

            return budgetReports;
        } catch (error) {
            logger.error(
                {
                    month,
                    year,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to get budget report'
            );
            if (error instanceof Error) {
                throw new Error(`Failed to get budget report for month ${month}: ${error.message}`);
            }
            throw new Error(`Failed to get budget report for month ${month}`);
        }
    }

    /**
     * Gets the untracked transactions for a particular budget. Usually indicates something fell through the cracks.
     *
     * We follow the following rules to create this list:
     * - Must not have a budget
     * - Must not be a bill, these are tracked outside of the budget
     * - Must not be disposable income, this is also tracked outside of the budget
     */
    async getUntrackedTransactions(month: number, year: number): Promise<TransactionSplit[]> {
        let transactions = await this.budgetService.getTransactionsWithoutBudget(month, year);

        transactions = transactions.filter(t => {
            return (
                !this.transactionPropertyService.isBill(t) &&
                !this.transactionPropertyService.isDisposableIncome(t)
            );
        });

        return transactions;
    }
}
