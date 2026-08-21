import { BudgetReportDto } from '../types/dto/budget-report.dto.js';
import { TopExpenseDto } from '../types/dto/top-expense.dto.js';
import {
    BudgetLimitDto,
    HistoricalComparisonDto,
    TransactionStats,
    MerchantInsight,
} from '../types/dto/budget-limit.dto.js';
import { BudgetReportService } from './budget-report.service.js';
import { IBudgetService } from './core/budget.service.interface.js';
import { TransactionService } from './core/transaction.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../logger.js';
import { BUSINESS_CONSTANTS } from '../utils/business-constants.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';

/**
 * Service for aggregating and analyzing budget data with historical context
 * Provides budget reports with statistics and trends
 */
export class BudgetAnalyticsService {
    constructor(
        private readonly budgetReportService: BudgetReportService,
        private readonly budgetService: IBudgetService,
        private readonly transactionService: TransactionService
    ) {}

    /**
     * Gets budget report with historical context and statistics
     * Fetches current month data plus historical months for comparison
     * @param month Current month (1-12)
     * @param year Current year
     * @param historyMonths Number of months back to compare (default: 1)
     * @returns Budget reports with all calculated fields
     */
    async getBudgetReport(
        month: number,
        year: number,
        historyMonths: number = 1
    ): Promise<BudgetReportDto[]> {
        logger.debug({ month, year, historyMonths }, 'Fetching budget report');

        try {
            // Get current month budget data
            const currentResult = await this.budgetReportService.getBudgetReport(month, year);
            if (!currentResult.ok) {
                throw new Error(currentResult.error.message);
            }
            const currentBudgets = currentResult.value;

            // Fetch historical months in parallel, but keep them in chronological
            // order (index 0 = most recent previous month) rather than the order
            // their API calls happened to finish in
            const historicalMonths = Array.from({ length: historyMonths }, (_, i) =>
                this.getPreviousMonthYear(month, year, i + 1)
            );
            const historicalResults = await Promise.all(
                historicalMonths.map(({ prevMonth, prevYear }) =>
                    this.budgetReportService.getBudgetReport(prevMonth, prevYear)
                )
            );
            const historicalData: BudgetLimitDto[][] = historicalResults.map(result =>
                result.ok ? result.value : []
            );

            // Get all transactions for statistics
            const transactions = await this.transactionService.getTransactionsForMonth(month, year);

            // Enhance each budget with statistics and historical data
            const enhanced = currentBudgets.map(budget => {
                const stats = this.calculateBudgetStatistics(
                    budget.budgetId,
                    month,
                    year,
                    transactions
                );

                const historical = this.calculateHistoricalComparison(
                    budget.budgetId,
                    budget.amount,
                    budget.spent,
                    historicalData
                );

                // Budgets with no limit for the month have amount 0 — avoid Infinity/NaN
                const percentageUsed =
                    budget.amount > 0 ? (Math.abs(budget.spent) / budget.amount) * 100 : 0;
                const remaining = budget.amount + budget.spent;
                const isOverBudget = remaining < 0;

                return {
                    ...budget,
                    status: this.determineStatus(percentageUsed, isOverBudget),
                    percentageUsed: percentageUsed,
                    remaining: remaining,
                    historicalComparison: historical,
                    transactionStats: stats,
                };
            });

            logger.debug({ count: enhanced.length }, 'Budget report generated');
            return enhanced;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error({ error: err.message, month, year }, 'Failed to get budget report');
            throw err;
        }
    }

    /**
     * Gets top N expenses (transactions) for the month
     * Sorted by amount descending
     * @param month Month (1-12)
     * @param year Year
     * @param limit Number of top expenses to return (default: 5)
     * @returns Top expenses sorted by amount
     */
    async getTopExpenses(month: number, year: number, limit: number = 5): Promise<TopExpenseDto[]> {
        logger.debug({ month, year, limit }, 'Fetching top expenses');

        try {
            const transactions = await this.transactionService.getTransactionsForMonth(month, year);

            // Filter to withdrawal/expenses only (negative amounts)
            const expenses = transactions.filter(t => {
                const amount = parseFloat(t.amount);
                return amount < 0;
            });

            // Sort by absolute amount descending
            const sorted = expenses.sort((a, b) => {
                const amountA = Math.abs(parseFloat(a.amount));
                const amountB = Math.abs(parseFloat(b.amount));
                return amountB - amountA;
            });

            // Map to TopExpenseDto and limit
            const topExpenses = sorted.slice(0, limit).map((t, index) => ({
                description: t.description || `Transaction ${index + 1}`,
                amount: Math.abs(parseFloat(t.amount)),
                budgetName: t.budget_name || 'Unbudgeted',
                date: (t.date || new Date().toISOString()).split('T')[0],
                transactionId: t.transaction_journal_id || '',
                currencySymbol: t.currency_symbol || '$',
            }));

            logger.debug({ count: topExpenses.length }, 'Top expenses fetched');
            return topExpenses;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error({ error: err.message, month, year }, 'Failed to get top expenses');
            throw err;
        }
    }

    /**
     * Calculates transaction statistics for a budget
     * @param budgetId Budget ID
     * @param month Month (1-12)
     * @param year Year
     * @param allTransactions All transactions for the month (for efficiency)
     * @returns Transaction statistics
     */
    private calculateBudgetStatistics(
        budgetId: string,
        month: number,
        year: number,
        allTransactions: TransactionSplit[]
    ): TransactionStats {
        try {
            // Filter transactions for this budget
            const budgetTransactions = allTransactions.filter(t => t.budget_id === budgetId);

            if (budgetTransactions.length === 0) {
                return {
                    count: 0,
                    average: 0,
                };
            }

            // Calculate count and average
            const count = budgetTransactions.length;
            const totalAmount = TransactionCalculationUtils.calculateTransactionTotal(
                budgetTransactions,
                true,
                logger
            );
            const average = totalAmount / count;

            // Find top merchant (most frequent description)
            const merchantCounts = new Map<string, { count: number; total: number }>();
            budgetTransactions.forEach(t => {
                const merchant = t.description || 'Unknown';
                const entry = merchantCounts.getOrInsert(merchant, { count: 0, total: 0 });
                entry.count += 1;
                entry.total += Math.abs(TransactionCalculationUtils.parseAmountSafe(t.amount));
            });

            let topMerchant: MerchantInsight | undefined;
            let maxCount = 0;
            merchantCounts.forEach((value, key) => {
                if (value.count > maxCount) {
                    maxCount = value.count;
                    topMerchant = {
                        name: key,
                        visitCount: value.count,
                        totalSpent: value.total,
                    };
                }
            });

            return {
                count,
                average,
                topMerchant,
            };
        } catch (error) {
            logger.warn(
                { error: error instanceof Error ? error.message : String(error), budgetId },
                'Failed to calculate budget statistics'
            );
            return {
                count: 0,
                average: 0,
            };
        }
    }

    /**
     * Calculates historical comparison for a budget
     * Compares current spending to previous month and 3-month average
     * @param budgetId Budget ID
     * @param budgetAmount Budget limit amount
     * @param currentSpent Current month spending
     * @param historicalData Map of historical budget data
     * @returns Historical comparison
     */
    private calculateHistoricalComparison(
        budgetId: string,
        budgetAmount: number,
        currentSpent: number,
        historicalData: BudgetLimitDto[][]
    ): HistoricalComparisonDto {
        try {
            // In chronological order: index 0 is the most recent previous month
            const historicalValues = historicalData
                .map(budgets => budgets.find(b => b.budgetId === budgetId))
                .filter((budget): budget is BudgetLimitDto => budget !== undefined)
                .map(budget => Math.abs(budget.spent));

            const previousMonthSpent = historicalValues.length > 0 ? historicalValues[0] : 0;

            // Calculate 3-month average (including current month if we have enough data)
            const allValues = [Math.abs(currentSpent), ...historicalValues];
            const averageWindow = allValues.slice(0, Math.min(3, allValues.length));
            const averageSpent =
                averageWindow.length > 0
                    ? averageWindow.reduce((sum, val) => sum + val, 0) / averageWindow.length
                    : 0;

            return {
                previousMonthSpent,
                averageSpent,
            };
        } catch (error) {
            logger.warn(
                { error: error instanceof Error ? error.message : String(error), budgetId },
                'Failed to calculate historical comparison'
            );
            return {
                previousMonthSpent: 0,
                averageSpent: 0,
            };
        }
    }

    /**
     * Determines budget status based on spending percentage
     * @param percentageUsed Percentage of budget used
     * @param isOverBudget Whether budget is over
     * @returns Status: 'over', 'on-track', or 'under'
     */
    private determineStatus(
        percentageUsed: number,
        isOverBudget: boolean
    ): 'over' | 'on-track' | 'under' {
        if (isOverBudget) {
            return 'over';
        }
        if (percentageUsed >= BUSINESS_CONSTANTS.BUDGET.ON_TRACK_THRESHOLD) {
            return 'on-track';
        }
        return 'under';
    }

    /**
     * Gets the previous month and year
     * @param month Current month (1-12)
     * @param year Current year
     * @param monthsBack Number of months to go back
     * @returns Object with prevMonth and prevYear
     */
    private getPreviousMonthYear(
        month: number,
        year: number,
        monthsBack: number
    ): { prevMonth: number; prevYear: number } {
        let prevMonth = month - monthsBack;
        let prevYear = year;

        while (prevMonth <= 0) {
            prevMonth += 12;
            prevYear -= 1;
        }

        return { prevMonth, prevYear };
    }
}
