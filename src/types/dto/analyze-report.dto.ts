import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BillComparisonDto } from './bill-comparison.dto.js';

/**
 * Data Transfer Object for analyze command report.
 * Encapsulates all data needed for budget finalization analysis display.
 */
export class AnalyzeReportDto {
    constructor(
        // Income
        public additionalIncome: TransactionSplit[],
        public additionalIncomeTotal: number,

        // Expenses
        public unbudgetedExpenses: TransactionSplit[],
        public unbudgetedExpenseTotal: number,

        // Budget
        public budgetAllocated: number, // total budget allocated
        public budgetSpent: number, // total budget spent
        public budgetSurplus: number, // positive = under budget, negative = over budget

        // Bills
        public billComparison: BillComparisonDto,

        // Paycheck
        public expectedMonthlyPaycheck: number, // expected paycheck from config
        public actualPaycheck: number, // actual paycheck received
        public paycheckSurplus: number, // variance: positive = surplus (earned more), negative = deficit (earned less)

        // Disposable Income
        public disposableIncome: number,

        // Calculations
        public netImpact: number, // Total surplus/deficit from all sources

        // Flags
        public skipPaycheck: boolean, // Whether paycheck analysis was skipped

        // Metadata
        public month: number,
        public year: number,
        public currencySymbol: string,
        public currencyCode: string
    ) {}

    /**
     * Factory method to create AnalyzeReportDto from calculation results.
     * Handles currency extraction and net impact calculation.
     */
    static create(
        additionalIncome: TransactionSplit[],
        unbudgetedExpenses: TransactionSplit[],
        budgetAllocated: number,
        budgetSpent: number,
        budgetSurplus: number,
        billComparison: BillComparisonDto,
        expectedMonthlyPaycheck: number,
        actualPaycheck: number,
        paycheckSurplus: number,
        disposableIncome: number,
        month: number,
        year: number,
        skipPaycheck: boolean = false
    ): AnalyzeReportDto {
        // Calculate totals
        const additionalIncomeTotal = additionalIncome.reduce((sum, t) => {
            const amount = parseFloat(t.amount);
            return sum + (isNaN(amount) ? 0 : amount);
        }, 0);

        const unbudgetedExpenseTotal = unbudgetedExpenses.reduce((sum, t) => {
            const amount = parseFloat(t.amount);
            return sum + Math.abs(isNaN(amount) ? 0 : amount);
        }, 0);

        // Calculate net impact from all sources
        // Positive factors: additional income, paycheck surplus (if enabled), budget surplus
        // Negative factors: bill overspend, unbudgeted expenses, disposable income
        // Note: Bill variance is subtracted (positive variance = overspent = reduces position)
        // When variance is negative (underspent), subtracting it increases net position
        const netImpact =
            additionalIncomeTotal +
            budgetSurplus +
            (skipPaycheck ? 0 : paycheckSurplus) - // Conditional paycheck
            billComparison.variance - // Positive reduces, negative increases
            unbudgetedExpenseTotal -
            disposableIncome;

        // Extract currency from bill comparison (or use defaults)
        const currencySymbol = billComparison.currencySymbol || '$';
        const currencyCode = billComparison.currencyCode || 'USD';

        return new AnalyzeReportDto(
            additionalIncome,
            additionalIncomeTotal,
            unbudgetedExpenses,
            unbudgetedExpenseTotal,
            budgetAllocated,
            budgetSpent,
            budgetSurplus,
            billComparison,
            expectedMonthlyPaycheck,
            actualPaycheck,
            paycheckSurplus,
            disposableIncome,
            netImpact,
            skipPaycheck,
            month,
            year,
            currencySymbol,
            currencyCode
        );
    }
}
