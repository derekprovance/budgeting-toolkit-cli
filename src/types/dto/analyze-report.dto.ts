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
        public disposableIncome: number,

        // Budget-rollup correction
        /**
         * Transactions that carry a budget — and are therefore inside Firefly's
         * server-side budgetSpent rollup — but should not be charged to the
         * envelope through it. The rollup has no per-transaction handle, so it
         * cannot be filtered locally; these are corrected arithmetically in
         * netImpact instead.
         *
         * Two different defects are corrected here:
         * - a **bill** is genuinely double-counted (subtracted as a bill AND
         *   inside budgetSpent);
         * - a **disposable** transaction is counted once too many, because it
         *   is charged to the pool rather than the envelope and belongs to no
         *   bucket at all.
         */
        public budgetRollupTransactions: TransactionSplit[],
        public budgetRollupCorrection: number,

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
     * than was subtracted would invent income. Only meaningful for a bucket
     * that actually subtracts something — bills. Disposable no longer does, so
     * it uses {@link fullCorrection} instead.
     */
    private static cappedCorrection(budgeted: TransactionSplit[], bucketTotal: number): number {
        const budgetedTotal = TransactionCalculationUtils.calculateNetSpend(budgeted);
        return Math.max(0, Math.min(budgetedTotal, bucketTotal));
    }

    /**
     * The whole of {@link budgeted}, floored at zero.
     *
     * For spending that belongs to no bucket: nothing subtracted it besides the
     * budget rollup, so there is no bucket total to bound against and capping
     * would silently under-credit. The caller still bounds the sum by
     * budgetSpent.
     */
    private static fullCorrection(budgeted: TransactionSplit[]): number {
        return Math.max(0, TransactionCalculationUtils.calculateNetSpend(budgeted));
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
        disposableIncome: number,
        month: number,
        year: number,
        disposableBudgetedTransactions: TransactionSplit[] = []
    ): AnalyzeReportDto {
        // Calculate totals
        // Signed helper even though AdditionalIncomeService filters to deposits:
        // this total feeds netImpact directly, so it must not depend on the
        // upstream filter staying homogeneous.
        const additionalIncomeTotal =
            TransactionCalculationUtils.calculateNetIncome(additionalIncome);

        const unbudgetedExpenseTotal =
            TransactionCalculationUtils.calculateNetSpend(unbudgetedExpenses);

        // Transactions that carry a budget and therefore sit inside Firefly's
        // server-side budgetSpent rollup, which cannot be filtered locally.
        const billBudgetedTransactions = billComparison.budgetedTransactions ?? [];
        const budgetRollupTransactions = [
            ...billBudgetedTransactions,
            ...disposableBudgetedTransactions,
        ];

        // Two corrections with genuinely different reasons, so they are bounded
        // differently:
        //
        // - A BILL is subtracted twice — once as a bill, once inside
        //   budgetSpent. Crediting back more than the bill bucket subtracted
        //   would invent income, hence the cap.
        // - A DISPOSABLE transaction is charged to the pool, not the envelope
        //   (see CLAUDE.md, "Disposable income"), so netImpact subtracts it
        //   nowhere. Only budgetSpent still contains it, and it must come back
        //   out in full. There is no bucket total to cap against — capping it
        //   at the disposable balance, as an earlier revision did, would
        //   under-credit whenever refunds shrank that balance.
        //
        // Both bounded together by budgetSpent: the premise of the whole
        // correction is that this spending is inside that rollup, so it cannot
        // credit back more than the rollup contains.
        const budgetRollupCorrection = Math.min(
            AnalyzeReportDto.cappedCorrection(
                billBudgetedTransactions,
                billComparison.actualTotal
            ) + AnalyzeReportDto.fullCorrection(disposableBudgetedTransactions),
            Math.max(0, budgetSpent)
        );

        // Calculate net impact: did cost of living fit inside the paycheck?
        // Income:   actual paycheck + additional income
        // Expenses: bills paid + budget spent + unbudgeted
        //
        // Disposable spending is deliberately absent: it is funded from the
        // disposable pool rather than the paycheck, so it is reported as a
        // transfer the owner still owes themselves, not as a charge against the
        // envelope. Do not reintroduce a `- disposableIncome` term here.
        const netImpact =
            actualPaycheck +
            additionalIncomeTotal -
            billComparison.actualTotal -
            budgetSpent -
            unbudgetedExpenseTotal +
            budgetRollupCorrection; // inside budgetSpent above; charge it once

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
            disposableIncome,
            budgetRollupTransactions,
            budgetRollupCorrection,
            netImpact,
            month,
            year,
            currencySymbol,
            currencyCode
        );
    }
}
