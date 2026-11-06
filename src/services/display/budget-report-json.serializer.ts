import { BudgetReportResult } from '../../types/dto/budget-report-result.dto.js';
import { BudgetReportJson } from '../../types/dto/report-json.types.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { toBillTotalsJson, toTransactionJson } from './report-json.serializer.js';

const { toCents } = CurrencyUtils;

/**
 * Builds the `report --json` document from what BudgetReportCommand computed.
 *
 * Per-budget figures are read straight off the DTOs. The totals and the
 * unbudgeted sum are the same arithmetic BudgetDisplayService performs for the text
 * report (sum of `spent` and `amount`; `calculateNetSpend` for unbudgeted), so
 * the two outputs cannot disagree. Money is rounded to cents and percentages
 * to two decimals.
 */
export function serializeBudgetReport(
    data: Pick<BudgetReportResult, 'budgets' | 'billComparison' | 'unbudgeted' | 'month' | 'year'>
): BudgetReportJson {
    const totalSpent = data.budgets.reduce((sum, b) => sum + b.spent, 0);
    const totalAllocated = data.budgets.reduce((sum, b) => sum + b.amount, 0);
    const totalPercentage = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

    return {
        schemaVersion: 2,
        month: data.month,
        year: data.year,
        currencySymbol: data.billComparison.currencySymbol,
        totals: {
            spent: toCents(totalSpent),
            allocated: toCents(totalAllocated),
            percentageUsed: toCents(totalPercentage),
        },
        budgets: data.budgets.map(budget => ({
            id: budget.budgetId,
            name: budget.name,
            allocated: toCents(budget.amount),
            spent: toCents(budget.spent),
            remaining: toCents(budget.remaining),
            percentageUsed: toCents(budget.percentageUsed),
            status: budget.status,
            previousMonthSpent:
                budget.historicalComparison?.previousMonthSpent !== undefined
                    ? toCents(budget.historicalComparison.previousMonthSpent)
                    : null,
            averageSpent:
                budget.historicalComparison?.averageSpent !== undefined
                    ? toCents(budget.historicalComparison.averageSpent)
                    : null,
        })),
        bills: toBillTotalsJson(data.billComparison),
        unbudgetedExpenses: {
            total: toCents(TransactionCalculationUtils.calculateNetSpend(data.unbudgeted)),
            transactions: data.unbudgeted.map(toTransactionJson),
        },
    };
}
