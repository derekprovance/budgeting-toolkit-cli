import { BillComparison, BillDetail } from '../interface/bill-comparison.interface';

/**
 * Data Transfer Object for bill comparison results
 */
export class BillComparisonDto implements BillComparison {
    constructor(
        public predictedMonthlyAverage: number,
        public actualMonthlyTotal: number,
        public variance: number,
        public bills: BillDetail[],
        public currencyCode: string,
        public currencySymbol: string
    ) {}

    /**
     * Creates a BillComparisonDto from raw data
     */
    static create(
        predictedMonthlyAverage: number,
        actualMonthlyTotal: number,
        bills: BillDetail[],
        currencyCode: string,
        currencySymbol: string
    ): BillComparisonDto {
        const variance = actualMonthlyTotal - predictedMonthlyAverage;
        return new BillComparisonDto(
            predictedMonthlyAverage,
            actualMonthlyTotal,
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
