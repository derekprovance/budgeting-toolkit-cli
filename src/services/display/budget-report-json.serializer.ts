import { BudgetReportDto } from '../../types/dto/budget-report.dto.js';
import { BillComparisonDto } from '../../types/dto/bill-comparison.dto.js';
import { CategorizedUnbudgetedDto } from '../../types/dto/categorized-unbudgeted.dto.js';
import { BudgetReportJson } from '../../types/dto/report-json.types.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { toBillTotalsJson, toTransactionJson } from './report-json.serializer.js';

const { toCents } = CurrencyUtils;

/**
 * The parts of BudgetReportCommand's report data that the JSON contract
 * carries. The command's full result is a structural superset.
 */
export interface BudgetReportSerializerInput {
    budgets: BudgetReportDto[];
    billComparison: BillComparisonDto;
    unbudgeted: CategorizedUnbudgetedDto[];
    month: number;
    year: number;
}

/**
 * Builds the `report --json` document from what BudgetReportCommand computed.
 *
 * Per-budget figures are read straight off the DTOs. The totals and the
 * unbudgeted sum are the same arithmetic BudgetDisplayService performs for the text
 * report (sum of `spent` and `amount`; `calculateNetSpend` for unbudgeted), so
 * the two outputs cannot disagree. Money is rounded to cents and percentages
 * to two decimals.
 */
export function serializeBudgetReport(data: BudgetReportSerializerInput): BudgetReportJson {
    const totalSpent = data.budgets.reduce((sum, b) => sum + b.spent, 0);
    const totalAllocated = data.budgets.reduce((sum, b) => sum + b.amount, 0);
    const totalPercentage = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

    const unbudgeted = data.unbudgeted.map(item => item.transaction);

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
            total: toCents(TransactionCalculationUtils.calculateNetSpend(unbudgeted)),
            transactions: unbudgeted.map(toTransactionJson),
        },
    };
}
