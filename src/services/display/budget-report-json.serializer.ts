import { BudgetReportResult } from '../../types/dto/budget-report-result.dto.js';
import { BudgetReportJson } from '../../types/dto/report-json.types.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { budgetTotals } from './budget-totals.utils.js';
import { toBillTotalsJson, toTransactionJson } from './report-json.serializer.js';

const { toCents } = CurrencyUtils;

/**
 * Totals come from `budgetTotals` and `calculateNetSpend`, as in
 * BudgetDisplayService, so the text and JSON reports cannot disagree. Money is
 * rounded to cents and percentages to two decimals.
 */
export function serializeBudgetReport(
    data: Pick<BudgetReportResult, 'budgets' | 'billComparison' | 'unbudgeted' | 'month' | 'year'>
): BudgetReportJson {
    const totals = budgetTotals(data.budgets);

    return {
        schemaVersion: 2,
        month: data.month,
        year: data.year,
        currencySymbol: data.billComparison.currencySymbol,
        totals: {
            spent: toCents(totals.spent),
            allocated: toCents(totals.allocated),
            percentageUsed: toCents(totals.percentageUsed),
        },
        budgets: data.budgets.map(budget => ({
            id: budget.budgetId,
            name: budget.name,
            allocated: toCents(budget.amount),
            spent: toCents(budget.spent),
            remaining: toCents(budget.remaining),
            percentageUsed: toCents(budget.percentageUsed),
            status: budget.status,
            previousMonthSpent: toCents(budget.historicalComparison.previousMonthSpent),
            averageSpent: toCents(budget.historicalComparison.averageSpent),
        })),
        bills: toBillTotalsJson(data.billComparison),
        unbudgetedExpenses: {
            total: toCents(TransactionCalculationUtils.calculateNetSpend(data.unbudgeted)),
            transactions: data.unbudgeted.map(toTransactionJson),
        },
    };
}
