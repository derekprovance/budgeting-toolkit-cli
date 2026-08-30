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
        public frequency: string,
        /**
         * The next date this bill still falls due within the month, if nothing
         * has been paid yet. Lets a display distinguish a bill that has not
         * come around from one that was paid under budget — without it both
         * render as `$0.00` against a non-zero expectation and look identical.
         *
         * Only dates still in the future count. A bill already past its date
         * and unpaid is not "upcoming"; it is simply unpaid, and judging it
         * normally is the honest reading.
         */
        public dueDate?: Date,
        /**
         * The part of {@link predicted} that has not fallen due yet. Usually
         * all of it or none, but a bill due several times in a month can be
         * partly behind and partly ahead.
         */
        public upcomingAmount: number = 0
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
 * Whether a bill still has a payment ahead of it this month.
 *
 * The single definition of "upcoming": the row renderers and the status emoji
 * all ask here rather than each re-deriving it from `dueDate`, so the icon and
 * the text beside it cannot come to different conclusions.
 *
 * A free function rather than a method because these DTOs are routinely built
 * as plain objects.
 */
export function isBillUpcoming(bill: BillDetailDto, now: Date = new Date()): boolean {
    return !!bill.dueDate && bill.dueDate.getTime() > now.getTime();
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
