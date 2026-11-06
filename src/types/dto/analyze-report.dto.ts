import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BillComparisonDto } from './bill-comparison.dto.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';
import { MonthBuckets } from '../../services/cash-flow.service.js';
import { DEFAULT_CURRENCY } from '../../utils/currency.utils.js';

export interface AnalyzeReportInput {
    buckets: MonthBuckets;
    billComparison: BillComparisonDto;
    budgetAllocated: number;
    expectedMonthlyPaycheck: number;
    month: number;
    year: number;
}

export class AnalyzeReportDto {
    constructor(
        public additionalIncome: TransactionSplit[],
        public additionalIncomeTotal: number,
        public unbudgetedExpenses: TransactionSplit[],
        public unbudgetedExpenseTotal: number,
        public budgetAllocated: number,
        public budgetSpent: number,
        public budgetSurplus: number, // positive = under budget
        public billComparison: BillComparisonDto,
        public expectedMonthlyPaycheck: number,
        public actualPaycheck: number,
        public paycheckSurplus: number, // positive = earned more than expected
        public disposableIncomeTransactions: TransactionSplit[],
        public disposableIncome: number,
        public netImpact: number,
        public month: number,
        public year: number,
        public currencySymbol: string,
        public currencyCode: string
    ) {}

    /** The buckets are disjoint by construction, so the net needs no corrections. */
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
