import { localDay } from '../../utils/date.utils.js';
import { DEFAULT_CURRENCY } from '../../utils/currency.utils.js';

export class BillDetailDto {
    constructor(
        public id: string,
        public name: string,
        /** 0 when not due this month */
        public predicted: number,
        public actual: number,
        public frequency: string,
        /**
         * The next unpaid due date still ahead this month: tells a bill not yet due from one paid
         * under budget, which both show `$0.00`. A bill past its date and unpaid is not upcoming.
         */
        public dueDate?: Date,
        /**
         * The part of {@link predicted} not yet due; a bill due several times a month can be
         * partly behind and partly ahead.
         */
        public upcomingAmount: number = 0
    ) {}
}

export class BillComparisonDto {
    constructor(
        public predictedTotal: number,
        public actualTotal: number,
        /** actualTotal - predictedTotal: positive means over budget */
        public variance: number,
        public bills: BillDetailDto[],
        public currencyCode: string,
        public currencySymbol: string
    ) {}

    static create(
        predictedTotal: number,
        actualTotal: number,
        bills: BillDetailDto[],
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

    /** No bills and nothing paid, in the default currency */
    static empty(): BillComparisonDto {
        return BillComparisonDto.create(0, 0, [], DEFAULT_CURRENCY.code, DEFAULT_CURRENCY.symbol);
    }
}

/**
 * The single definition of "upcoming", so a row's icon and text cannot disagree. A free
 * function because these DTOs are routinely built as plain objects.
 */
export function isBillUpcoming(
    bill: BillDetailDto,
    now: Date = new Date()
): bill is BillDetailDto & { dueDate: Date } {
    // By calendar day, so a bill due today is still ahead of us
    return !!bill.dueDate && localDay(bill.dueDate) >= localDay(now);
}

/** Positive means the bill cost more than predicted */
export function billVariance(bill: Pick<BillDetailDto, 'actual' | 'predicted'>): number {
    return bill.actual - bill.predicted;
}

export function getTopBills(comparison: BillComparisonDto, limit: number = 4): BillDetailDto[] {
    return [...comparison.bills].sort((a, b) => b.actual - a.actual).slice(0, limit);
}

/** The bills after the top N, in the same order as getTopBills. */
export function getRemainingBills(
    comparison: BillComparisonDto,
    limit: number = 4
): BillDetailDto[] {
    return [...comparison.bills].sort((a, b) => b.actual - a.actual).slice(limit);
}
