import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

/**
 * Data Transfer Object for individual bill details.
 * Represents a single bill's expected and actual payment for a specific month.
 */
export class BillDetailDto {
    constructor(
        public id: string,
        public name: string,
        /** Expected payment amount for this month (0 if not due) */
        public predicted: number,
        /** Actual payment amount this month */
        public actual: number,
        public frequency: string
    ) {}
}

/**
 * Data Transfer Object for bill comparison results.
 * Compares expected bill payments for a specific month against actual payments.
 */
export class BillComparisonDto {
    constructor(
        /** Total expected bill payments for this specific month */
        public predictedTotal: number,
        /** Total actual bill payments made this month */
        public actualTotal: number,
        /**
         * Variance between actual and predicted bill amounts.
         * Positive: spent MORE than predicted (over budget)
         * Negative: spent LESS than predicted (under budget)
         * Formula: actualTotal - predictedTotal
         */
        public variance: number,
        public bills: BillDetailDto[],
        public currencyCode: string,
        public currencySymbol: string,
        /**
         * The bill transactions counted in {@link actualTotal} that ALSO carry
         * a budget, and are therefore inside Firefly's server-side budget total
         * as well. The analyze report uses these to avoid subtracting the same
         * spending twice. Optional so fixtures that don't exercise the overlap
         * can omit it.
         */
        public budgetedTransactions?: TransactionSplit[]
    ) {}

    /**
     * Creates a BillComparisonDto from raw data
     */
    static create(
        predictedTotal: number,
        actualTotal: number,
        bills: BillDetailDto[],
        currencyCode: string,
        currencySymbol: string,
        budgetedTransactions?: TransactionSplit[]
    ): BillComparisonDto {
        const variance = actualTotal - predictedTotal;
        return new BillComparisonDto(
            predictedTotal,
            actualTotal,
            variance,
            bills,
            currencyCode,
            currencySymbol,
            budgetedTransactions
        );
    }
}

/**
 * Gets the top N bills by actual amount spent, sorted descending.
 */
export function getTopBills(comparison: BillComparisonDto, limit: number = 4): BillDetailDto[] {
    return [...comparison.bills].sort((a, b) => b.actual - a.actual).slice(0, limit);
}

/**
 * Gets the remaining bills after the top N, in the same sorted order.
 */
export function getRemainingBills(
    comparison: BillComparisonDto,
    limit: number = 4
): BillDetailDto[] {
    return [...comparison.bills].sort((a, b) => b.actual - a.actual).slice(limit);
}
