import {
    BillComparisonDto as BillComparison,
    BillDetailDto as BillDetail,
} from './bill-comparison.dto.js';

/**
 * Data Transfer Object for bill comparison results.
 * Compares expected bill payments for a specific month against actual payments.
 */
export class BillComparisonDto implements BillComparison {
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
        public bills: BillDetail[],
        public currencyCode: string,
        public currencySymbol: string
    ) {}

    /**
     * Creates a BillComparisonDto from raw data
     */
    static create(
        predictedTotal: number,
        actualTotal: number,
        bills: BillDetail[],
        currencyCode: string,
        currencySymbol: string
    ): BillComparisonDto {
        const variance = actualTotal - predictedTotal;
        return new BillComparisonDto(
            predictedTotal,
            actualTotal,
            variance,
            bills,
            currencyCode,
            currencySymbol
        );
    }
}

/**
 * Data Transfer Object for individual bill details
 */
export class BillDetailDto implements BillDetail {
    constructor(
        public id: string,
        public name: string,
        public predicted: number,
        public actual: number,
        public frequency: string
    ) {}
}
