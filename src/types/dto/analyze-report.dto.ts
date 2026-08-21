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

        const unbudgetedExpenseTotal = TransactionCalculationUtils.calculateTransactionTotal(
            unbudgetedExpenses,
            true
        );

        // Transactions counted in the bills or disposable buckets that also sit
        // inside Firefly's server-side budgetSpent rollup. budgetSpent cannot be
        // filtered locally, so the overlap is added back once below.
        const doubleCountedTransactions = [
            ...(billComparison.budgetedTransactions ?? []),
            ...disposableBudgetedTransactions,
        ];
        const doubleCountedTotal = TransactionCalculationUtils.calculateTransactionTotal(
            doubleCountedTransactions,
            true
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
