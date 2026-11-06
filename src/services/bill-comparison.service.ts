import { BillRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../logger.js';
import { BillComparisonDto, BillDetailDto } from '../types/dto/bill-comparison.dto.js';
import { Day, localDay } from '../utils/date.utils.js';
import {
    dueDatesInMonth,
    expectedBillAmount,
    unpaidDatesInMonth,
} from '../utils/bill-schedule.utils.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { BillService } from './core/bill.service.js';
import { CashFlowService } from './cash-flow.service.js';
import { billIdOf } from './core/transaction-classification.service.js';
import { Result } from '../types/result.type.js';
import { DEFAULT_CURRENCY } from '../utils/currency.utils.js';
import { MonthError, monthFailure } from '../types/error/month.error.js';

export class BillComparisonService {
    constructor(
        private readonly billService: BillService,
        private readonly cashFlowService: CashFlowService
    ) {}

    /**
     * Expected versus paid for every bill this month (R-BILL-1).
     *
     * @returns The comparison, or the month's error when the bills or the
     *   bill bucket could not be read
     */
    async calculateBillComparison(
        month: number,
        year: number
    ): Promise<Result<BillComparisonDto, MonthError>> {
        try {
            return await this.compare(month, year);
        } catch (error) {
            return monthFailure('BILL_COMPARISON_FAILED', { month, year }, error);
        }
    }

    private async compare(
        month: number,
        year: number
    ): Promise<Result<BillComparisonDto, MonthError>> {
        // Deactivated bills are listed too: they predict nothing, but spending
        // still linked to them has to be counted somewhere
        const [bills, buckets] = await Promise.all([
            this.billService.getBillsForMonth(month, year),
            this.cashFlowService.getBuckets(month, year),
        ]);
        if (!buckets.ok) {
            return Result.err(buckets.error);
        }

        // The bill bucket: bill-linked envelope withdrawals and their refunds
        // (R-BILL-1). A bill paid from outside the envelope is not here: it
        // shows as expected but not paid.
        const paidByBill = Map.groupBy(buckets.value.bill, billIdOf);
        const period: BillPeriod = { month, year, today: localDay(new Date()) };
        const details = [
            ...bills.flatMap(
                bill => compareBill(bill, paidByBill.get(bill.id) ?? [], period) ?? []
            ),
            ...unlistedBills(bills, paidByBill, period),
        ];

        const predictedTotal = details.reduce((sum, bill) => sum + bill.predicted, 0);
        const actualTotal = details.reduce((sum, bill) => sum + bill.actual, 0);
        logger.debug(
            { month, year, billCount: bills.length, predictedTotal, actualTotal },
            'Bill comparison calculated successfully'
        );

        const first = bills[0]?.attributes;
        return Result.ok(
            BillComparisonDto.create(
                predictedTotal,
                actualTotal,
                details,
                first?.currency_code ?? first?.primary_currency_code ?? DEFAULT_CURRENCY.code,
                first?.currency_symbol ?? first?.primary_currency_symbol ?? DEFAULT_CURRENCY.symbol
            )
        );
    }
}

interface BillPeriod {
    month: number;
    year: number;
    today: Day;
}

/**
 * Expected versus paid for one bill: its amount for every date it falls due
 * this month, against the net of its bill-bucket transactions, so a refund
 * linked to the bill reduces what it cost.
 *
 * @returns Nothing for a bill that neither falls due nor sees any activity
 *   this month: it would render as "$0.00 (expected $0.00)"
 */
function compareBill(
    bill: BillRead,
    paid: TransactionSplit[],
    { month, year, today }: BillPeriod
): BillDetailDto | undefined {
    // A deactivated bill predicts nothing; it is listed only so spending
    // still linked to it is counted
    const isActive = bill.attributes.active ?? false;
    const dueDates = isActive ? dueDatesInMonth(bill, month, year) : [];
    if (dueDates.length === 0 && paid.length === 0) {
        return undefined;
    }

    const amount = expectedBillAmount(bill);
    const actualAmount = TransactionCalculationUtils.calculateNetSpend(paid, logger);
    const predictedAmount = amount * dueDates.length;
    const upcoming = isActive
        ? unpaidDatesInMonth(bill, month, year).filter(day => day >= today)
        : [];

    logger.debug(
        {
            billId: bill.id,
            billName: bill.attributes.name,
            dueDates,
            upcoming,
            predictedAmount,
            actualAmount,
        },
        'Compared bill'
    );

    return new BillDetailDto(
        bill.id,
        bill.attributes.name ?? 'Unknown Bill',
        predictedAmount,
        actualAmount,
        bill.attributes.repeat_freq ?? 'monthly',
        upcoming.length > 0 ? new Date(`${upcoming[0]}T00:00:00`) : undefined,
        amount * upcoming.length
    );
}

/**
 * Bill-bucket spending linked to a bill this month's bill list does not
 * contain, a deleted bill most often. Every other bucket rejects a bill-linked
 * transaction, so without these rows it would vanish from the net.
 */
function unlistedBills(
    bills: BillRead[],
    paidByBill: Map<string | undefined, TransactionSplit[]>,
    { month, year }: BillPeriod
): BillDetailDto[] {
    const listed = new Set(bills.map(bill => bill.id));
    return [...paidByBill]
        .filter((entry): entry is [string, TransactionSplit[]] => {
            const [billId] = entry;
            return billId !== undefined && !listed.has(billId);
        })
        .map(([billId, paid]) => {
            const actualAmount = TransactionCalculationUtils.calculateNetSpend(paid, logger);
            logger.warn(
                { billId, transactionCount: paid.length, actualAmount, month, year },
                'Transactions reference a bill that is not in the bill list - counted as bills paid with no prediction'
            );
            return new BillDetailDto(
                billId,
                `Unknown Bill (#${billId})`,
                0,
                actualAmount,
                'unknown'
            );
        });
}
