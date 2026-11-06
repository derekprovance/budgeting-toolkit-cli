import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BillComparisonDto } from './bill-comparison.dto.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';
import { MonthBuckets } from '../../services/cash-flow.service.js';
import { DEFAULT_CURRENCY } from '../../utils/currency.utils.js';

/** What {@link AnalyzeReportDto.create} is built from */
export interface AnalyzeReportInput {
    buckets: MonthBuckets;
    billComparison: BillComparisonDto;
    budgetAllocated: number;
    expectedMonthlyPaycheck: number;
    month: number;
    year: number;
}

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
        public disposableIncomeTransactions: TransactionSplit[],
        public disposableIncome: number,

        // Calculations
        public netImpact: number, // Total surplus/deficit from all sources

        // Metadata
        public month: number,
        public year: number,
        public currencySymbol: string,
        public currencyCode: string
    ) {}

    /**
     * Totals each bucket and computes the net. Every bucket is disjoint by
     * construction (CashFlowService), so the net is plain arithmetic with no
     * corrections.
     */
    static create({
        buckets,
        billComparison,
        budgetAllocated,
        expectedMonthlyPaycheck,
        month,
        year,
    }: AnalyzeReportInput): AnalyzeReportDto {
        const { paycheck, additionalIncome, budget, unbudgeted, disposable } = buckets;
        const actualPaycheck = TransactionCalculationUtils.calculateNetIncome(paycheck);
        const additionalIncomeTotal =
            TransactionCalculationUtils.calculateNetIncome(additionalIncome);
        const budgetSpent = TransactionCalculationUtils.calculateNetSpend(budget);
        const unbudgetedExpenseTotal = TransactionCalculationUtils.calculateNetSpend(unbudgeted);
        const disposableIncome = TransactionCalculationUtils.calculateNetSpend(disposable);

        // RULES.md, R-PURPOSE-1: did cost of living fit inside the envelope?
        // Disposable spending is deliberately absent (R-DISP-1): the pool pays
        // for it, so it is stated below the net as a transfer instead.
        const netImpact =
            actualPaycheck +
            additionalIncomeTotal -
            billComparison.actualTotal -
            budgetSpent -
            unbudgetedExpenseTotal;

        return new AnalyzeReportDto(
            buckets.additionalIncome,
            additionalIncomeTotal,
            buckets.unbudgeted,
            unbudgetedExpenseTotal,
            budgetAllocated,
            budgetSpent,
            budgetAllocated - budgetSpent,
            billComparison,
            expectedMonthlyPaycheck,
            actualPaycheck,
            actualPaycheck - expectedMonthlyPaycheck,
            buckets.disposable,
            disposableIncome,
            netImpact,
            month,
            year,
            billComparison.currencySymbol || DEFAULT_CURRENCY.symbol,
            billComparison.currencyCode || DEFAULT_CURRENCY.code
        );
    }
}
