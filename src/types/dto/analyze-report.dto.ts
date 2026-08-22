import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BillComparisonDto } from './bill-comparison.dto.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';

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
        public disposableIncomeTransfers: TransactionSplit[], // Transfers OUT that reduce balance
        public disposableIncome: number,

        // Double-counting correction
        /**
         * Transactions counted in the bills or disposable buckets that ALSO
         * carry a budget. Firefly's budget total is a server-side rollup with
         * no per-transaction handle, so these cannot be filtered out of
         * budgetSpent — they are corrected arithmetically in netImpact instead.
         */
        public doubleCountedTransactions: TransactionSplit[],
        public doubleCountedTotal: number,

        // Calculations
        public netImpact: number, // Total surplus/deficit from all sources

        // Metadata
        public month: number,
        public year: number,
        public currencySymbol: string,
        public currencyCode: string
    ) {}

    /**
     * The portion of {@link budgeted} that a bucket genuinely double-counted.
     *
     * Bounded by what that bucket contributed to the net: crediting back more
     * than was subtracted would invent income.
     */
    private static cappedCorrection(budgeted: TransactionSplit[], bucketTotal: number): number {
        const budgetedTotal = TransactionCalculationUtils.calculateNetSpend(budgeted);
        return Math.max(0, Math.min(budgetedTotal, bucketTotal));
    }

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
        disposableIncomeTransactions: TransactionSplit[],
        disposableIncomeTransfers: TransactionSplit[],
        disposableIncome: number,
        month: number,
        year: number,
        disposableBudgetedTransactions: TransactionSplit[] = []
    ): AnalyzeReportDto {
        // Calculate totals
        const additionalIncomeTotal =
            TransactionCalculationUtils.calculateTransactionTotal(additionalIncome);

        const unbudgetedExpenseTotal =
            TransactionCalculationUtils.calculateNetSpend(unbudgetedExpenses);

        // Transactions counted in the bills or disposable buckets that also sit
        // inside Firefly's server-side budgetSpent rollup. budgetSpent cannot be
        // filtered locally, so the overlap is added back once below.
        const billBudgetedTransactions = billComparison.budgetedTransactions ?? [];
        const doubleCountedTransactions = [
            ...billBudgetedTransactions,
            ...disposableBudgetedTransactions,
        ];

        // The correction credits back spending that was subtracted twice, so it
        // can never exceed what each bucket actually subtracted. The disposable
        // bucket in particular reports a balance that is net of transfers and
        // floored at zero, while its budgeted-transaction list is neither — so
        // an uncapped add-back can hand back more than was ever taken away and
        // conjure cash out of nothing.
        // Bounded a second time by budgetSpent itself: the whole premise of the
        // correction is that this spending is already inside that rollup, so it
        // cannot credit back more than the rollup contains.
        const doubleCountedTotal = Math.min(
            AnalyzeReportDto.cappedCorrection(
                billBudgetedTransactions,
                billComparison.actualTotal
            ) + AnalyzeReportDto.cappedCorrection(disposableBudgetedTransactions, disposableIncome),
            Math.max(0, budgetSpent)
        );

        // Calculate net impact: true cash flow
        // Income: actual paycheck + additional income
        // Expenses: bills paid + budget spent + unbudgeted + disposable
        const netImpact =
            actualPaycheck +
            additionalIncomeTotal -
            billComparison.actualTotal -
            budgetSpent -
            unbudgetedExpenseTotal -
            disposableIncome +
            doubleCountedTotal; // already inside budgetSpent above; charge it once

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
            disposableIncomeTransactions,
            disposableIncomeTransfers,
            disposableIncome,
            doubleCountedTransactions,
            doubleCountedTotal,
            netImpact,
            month,
            year,
            currencySymbol,
            currencyCode
        );
    }
}
