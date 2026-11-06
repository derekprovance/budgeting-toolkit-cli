import { BudgetReportDto, BudgetStatus } from '../types/dto/budget-report.dto.js';
import { TopExpenseDto } from '../types/dto/top-expense.dto.js';
import {
    BudgetLimitDto,
    HistoricalComparisonDto,
    TransactionStats,
    MerchantInsight,
} from '../types/dto/budget-limit.dto.js';
import { BudgetReportService } from './budget-report.service.js';
import { CashFlowService, MonthBuckets } from './cash-flow.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../logger.js';
import { BUSINESS_CONSTANTS } from '../utils/business-constants.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { DEFAULT_CURRENCY } from '../utils/currency.utils.js';
import { shiftMonth } from '../utils/date.utils.js';

/**
 * Budget rows with statistics and history, and the month's top expenses, for
 * the `report` command.
 */
export class BudgetAnalyticsService {
    constructor(
        private readonly budgetReportService: BudgetReportService,
        private readonly cashFlowService: CashFlowService
    ) {}

    /**
     * Each budget's row for the month, with its usage, its transaction
     * statistics, and how it compares with the `historyMonths` months before.
     *
     * @throws Error, with the month's MonthError as `cause`, when this month's
     *   rows or buckets cannot be read. A previous month that cannot be read
     *   counts as no history.
     */
    async getBudgetReport(
        month: number,
        year: number,
        historyMonths: number
    ): Promise<BudgetReportDto[]> {
        const current = await this.budgetReportService.getBudgetReport(month, year);
        if (!current.ok) {
            throw new Error(current.error.message, { cause: current.error });
        }
        const history = await this.getHistory(month, year, historyMonths);

        // Statistics describe the same budget bucket the rows total
        const { budget: bucket } = await this.getBuckets(month, year);
        const spendingByBudget = Map.groupBy(bucket, t => t.budget_id);

        return current.value.map(budget => ({
            ...budget,
            ...usage(budget),
            historicalComparison: compareWithHistory(budget, history),
            transactionStats: statistics(spendingByBudget.get(budget.budgetId) ?? []),
        }));
    }

    /**
     * The month's `limit` largest expenses, largest first.
     *
     * @throws Error, with the month's MonthError as `cause`, when the month's
     *   buckets cannot be read
     */
    async getTopExpenses(month: number, year: number, limit: number): Promise<TopExpenseDto[]> {
        // The buckets in the net, less refunds; disposable purchases are the
        // pool's (R-DISP-1)
        const buckets = await this.getBuckets(month, year);
        const expenses = [...buckets.bill, ...buckets.budget, ...buckets.unbudgeted].filter(
            t => t.type !== 'deposit'
        );

        const sorted = expenses.sort(
            (a, b) =>
                TransactionCalculationUtils.parseAmountSafe(b.amount) -
                TransactionCalculationUtils.parseAmountSafe(a.amount)
        );

        return sorted.slice(0, limit).map((t, index) => ({
            description: t.description || `Transaction ${index + 1}`,
            amount: TransactionCalculationUtils.parseAmountSafe(t.amount),
            // Not "Unbudgeted": the report's section by that name excludes
            // bills, which would carry this label too
            budgetName: t.budget_name || 'no budget',
            date: (t.date || new Date().toISOString()).split('T')[0],
            transactionId: t.transaction_journal_id || '',
            currencySymbol: t.currency_symbol || DEFAULT_CURRENCY.symbol,
        }));
    }

    /** The rows of each of the `months` months before this one, most recent first */
    private async getHistory(
        month: number,
        year: number,
        months: number
    ): Promise<BudgetLimitDto[][]> {
        const previous = Array.from({ length: months }, (_, i) =>
            shiftMonth(month, year, -(i + 1))
        );
        const results = await Promise.all(
            previous.map(p => this.budgetReportService.getBudgetReport(p.month, p.year))
        );
        return results.map((result, i) => {
            if (result.ok) {
                return result.value;
            }
            // Shown as no history rather than failing the report, but never silently
            logger.warn(
                { ...previous[i], error: result.error.message },
                'Budget history unavailable for a previous month - its figures show as 0'
            );
            return [];
        });
    }

    private async getBuckets(month: number, year: number): Promise<MonthBuckets> {
        const result = await this.cashFlowService.getBuckets(month, year);
        if (!result.ok) {
            throw new Error(result.error.message, { cause: result.error });
        }
        return result.value;
    }
}

/**
 * A budget with no limit for the month has amount 0: nothing to divide by and
 * nothing to exceed, so it is never over budget.
 */
function usage({
    amount,
    spent,
}: BudgetLimitDto): Pick<BudgetReportDto, 'status' | 'percentageUsed' | 'remaining'> {
    const hasLimit = amount > 0;
    const percentageUsed = hasLimit ? (spent / amount) * 100 : 0;
    const remaining = amount - spent;
    return {
        status: budgetStatus(percentageUsed, hasLimit && remaining < 0),
        percentageUsed,
        remaining,
    };
}

function budgetStatus(percentageUsed: number, isOverBudget: boolean): BudgetStatus {
    if (isOverBudget) {
        return 'over';
    }
    if (percentageUsed >= BUSINESS_CONSTANTS.BUDGET.ON_TRACK_THRESHOLD) {
        return 'on-track';
    }
    return 'under';
}

/**
 * The budget's spend in the most recent history month it appears in, and the
 * mean over this month and every history month it appears in.
 */
function compareWithHistory(
    { budgetId, spent }: BudgetLimitDto,
    history: BudgetLimitDto[][]
): HistoricalComparisonDto {
    const previous = history
        .map(budgets => budgets.find(b => b.budgetId === budgetId))
        .filter((budget): budget is BudgetLimitDto => budget !== undefined)
        .map(budget => budget.spent);
    const months = [spent, ...previous];

    return {
        previousMonthSpent: previous[0] ?? 0,
        averageSpent: months.reduce((sum, value) => sum + value, 0) / months.length,
    };
}

/** Count, average and top merchant of one budget's transactions this month */
function statistics(transactions: TransactionSplit[]): TransactionStats {
    if (transactions.length === 0) {
        return { count: 0, average: 0 };
    }

    // Signed, so a refund in the bucket reduces the average
    const total = TransactionCalculationUtils.calculateNetSpend(transactions);
    return {
        count: transactions.length,
        average: total / transactions.length,
        topMerchant: topMerchant(transactions),
    };
}

/** The most visited merchant (by description), ties broken on spend */
function topMerchant(transactions: TransactionSplit[]): MerchantInsight | undefined {
    const byMerchant = Map.groupBy(transactions, t => t.description || 'Unknown');

    let top: MerchantInsight | undefined;
    for (const [name, visits] of byMerchant) {
        const totalSpent = visits.reduce(
            (sum, t) => sum + TransactionCalculationUtils.calculateNetSpend([t]),
            0
        );
        const wins =
            !top ||
            visits.length > top.visitCount ||
            (visits.length === top.visitCount && totalSpent > top.totalSpent);
        if (wins) {
            top = { name, visitCount: visits.length, totalSpent };
        }
    }
    return top;
}
