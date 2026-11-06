import { AnalyzeReportDto } from '../../types/dto/analyze-report.dto.js';
import { AnalyzeReportJson } from '../../types/dto/report-json.types.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { disposablePoolAction } from './disposable-pool-action.js';
import { toBillTotalsJson, toTransactionJson } from './report-json.serializer.js';

const { toCents } = CurrencyUtils;

/** Numbers are only rounded to cents, never recomputed, so JSON and text cannot disagree */
export function serializeAnalyzeReport(report: AnalyzeReportDto): AnalyzeReportJson {
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
            balance: toCents(report.disposableIncome),
            transactions: report.disposableIncomeTransactions.map(toTransactionJson),
            action: disposablePoolAction(report.disposableIncome),
        },
        netCashFlow: toCents(report.netImpact),
    };
}
