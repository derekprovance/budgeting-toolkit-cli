import { AnalyzeReportDto } from '../../types/dto/analyze-report.dto.js';
import { AnalyzeReportJson } from '../../types/dto/report-json.types.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { toBillTotalsJson, toTransactionJson } from './report-json.serializer.js';

const { toCents } = CurrencyUtils;

/**
 * Builds the `analyze --json` document from the report DTO.
 *
 * Every number is read straight off the DTO and only rounded to cents here —
 * nothing is recomputed, so the JSON and the text report cannot disagree.
 */
export function serializeAnalyzeReport(report: AnalyzeReportDto): AnalyzeReportJson {
    const balance = toCents(report.disposableIncome);

    return {
        schemaVersion: 2,
        month: report.month,
        year: report.year,
        currencyCode: report.currencyCode,
        currencySymbol: report.currencySymbol,
        paycheck: {
            expected: toCents(report.expectedMonthlyPaycheck),
            actual: toCents(report.actualPaycheck),
            variance: toCents(report.paycheckSurplus),
        },
        additionalIncome: {
            total: toCents(report.additionalIncomeTotal),
            transactions: report.additionalIncome.map(toTransactionJson),
        },
        unbudgetedExpenses: {
            total: toCents(report.unbudgetedExpenseTotal),
            transactions: report.unbudgetedExpenses.map(toTransactionJson),
        },
        budget: {
            allocated: toCents(report.budgetAllocated),
            spent: toCents(report.budgetSpent),
            remaining: toCents(report.budgetSurplus),
        },
        bills: {
            ...toBillTotalsJson(report.billComparison),
            bills: report.billComparison.bills.map(bill => ({
                id: bill.id,
                name: bill.name,
                predicted: toCents(bill.predicted),
                actual: toCents(bill.actual),
                frequency: bill.frequency,
            })),
        },
        disposable: {
            balance,
            transactions: report.disposableIncomeTransactions.map(toTransactionJson),
            // Mirrors the text report's action line: a positive balance is a
            // transfer out of the pool, a negative one a return to it.
            action:
                balance > 0
                    ? { direction: 'fromPool', amount: balance }
                    : balance < 0
                      ? { direction: 'toPool', amount: toCents(Math.abs(balance)) }
                      : null,
        },
        netCashFlow: toCents(report.netImpact),
    };
}
