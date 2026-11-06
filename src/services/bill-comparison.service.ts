import { BillRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../logger.js';
import { BillComparisonDto, BillDetailDto } from '../types/dto/bill-comparison.dto.js';
import { BillComparisonService as IBillComparisonService } from '../types/interface/bill-comparison.service.interface.js';
import { DateUtils } from '../utils/date.utils.js';
import { Day, dueDatesInMonth, toDay, today } from '../utils/bill-schedule.utils.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { BillService } from './core/bill.service.js';
import { CashFlowService } from './cash-flow.service.js';
import { Result } from '../types/result.type.js';
import { BillError, BillErrorFactory, BillErrorType } from '../types/error/bill.error.js';

export class BillComparisonService implements IBillComparisonService {
    constructor(
        private readonly billService: BillService,
        private readonly cashFlowService: CashFlowService
    ) {}

    /**
     * Calculates bill comparison for a given month and year.
     * Returns Result type for explicit error handling.
     *
     * @param month - Month to calculate (1-12)
     * @param year - Year to calculate
     * @returns Result containing bill comparison or error
     */
    async calculateBillComparison(
        month: number,
        year: number
    ): Promise<Result<BillComparisonDto, BillError>> {
        const operation = 'calculateBillComparison';

        const dateValidation = DateUtils.validateMonthYearResult(
            month,
            year,
            operation,
            (m, y, op, err) => BillErrorFactory.create(BillErrorType.INVALID_DATE, m, y, op, err)
        );
        if (!dateValidation.ok) {
            return Result.err(dateValidation.error);
        }

        try {
            // All bills with pay_dates populated for this month. Deactivated
            // bills are kept: they predict nothing, but spending still linked
            // to them has to be counted somewhere, and every other bucket
            // rejects a bill-linked transaction.
            const bills = await this.billService.getBillsForMonth(month, year);

            // The bill bucket: bill-linked envelope withdrawals and their
            // refunds (RULES.md, R-BILL-1). A bill paid from outside the
            // envelope is not here: it shows as expected but not paid.
            const buckets = await this.cashFlowService.getBuckets(month, year);
            if (!buckets.ok) {
                return Result.err(buckets.error);
            }
            const billTransactions = buckets.value.bill;

            // Bail out only when there is genuinely nothing to report. Returning
            // early on `bills.length === 0` alone would skip the orphan path
            // below, and bill-linked spending would then be charged nowhere at
            // all — every other bucket rejects a bill-linked transaction.
            if (bills.length === 0 && billTransactions.length === 0) {
                logger.debug('No bills or bill-linked transactions found for year ' + year);
                // Not an error - just return empty result
                return Result.ok(BillComparisonDto.create(0, 0, [], 'USD', '$'));
            }

            // Calculate bill details with predicted amounts based on pay_dates
            const { predictedTotal, actualTotal, billDetails } = this.calculateBillDetails(
                bills,
                billTransactions,
                month,
                year
            );

            // Get currency info from first bill or use default
            const currencyCode =
                bills[0]?.attributes.currency_code ??
                bills[0]?.attributes.primary_currency_code ??
                'USD';
            const currencySymbol =
                bills[0]?.attributes.currency_symbol ??
                bills[0]?.attributes.primary_currency_symbol ??
                '$';

            const result = BillComparisonDto.create(
                predictedTotal,
                actualTotal,
                billDetails,
                currencyCode,
                currencySymbol
            );

            logger.debug(
                {
                    month,
                    year,
                    billCount: bills.length,
                    predictedTotal,
                    actualTotal,
                },
                'Bill comparison calculated successfully'
            );

            return Result.ok(result);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));

            logger.error(
                {
                    month,
                    year,
                    operation,
                    error: err.message,
                    errorType: err.constructor.name,
                },
                'Failed to calculate bill comparison'
            );

            return Result.err(
                BillErrorFactory.create(
                    BillErrorType.CALCULATION_FAILED,
                    month,
                    year,
                    operation,
                    err
                )
            );
        }
    }

    /**
     * The unpaid due dates Firefly reports for this month, in order.
     *
     * `pay_dates` is payment-aware: it lists only the occurrences after the
     * latest payment in the window, and falls back to the next one outside it
     * (V11). So it says what is still owed, not what fell due; the month's
     * schedule comes from {@link dueDatesInMonth} instead.
     */
    private unpaidDatesInMonth(bill: BillRead, month: number, year: number): Day[] {
        const prefix = `${year}-${String(month).padStart(2, '0')}-`;
        return (bill.attributes.pay_dates ?? [])
            .map(toDay)
            .filter((day): day is Day => day !== null && day.startsWith(prefix))
            .sort();
    }

    /**
     * Get the expected amount for a bill
     * Uses average if available, otherwise midpoint of min/max
     */
    private getBillAmount(bill: BillRead): number {
        let amount: number;

        // Try to use amount_avg first
        if (bill.attributes.amount_avg) {
            amount = parseFloat(bill.attributes.amount_avg);
        } else {
            // Fall back to midpoint of min/max
            const min = parseFloat(bill.attributes.amount_min ?? '0');
            const max = parseFloat(bill.attributes.amount_max ?? min.toString());
            amount = (min + max) / 2;
        }

        if (isNaN(amount) || amount < 0) {
            logger.debug(
                {
                    billId: bill.id,
                    billName: bill.attributes.name,
                    amount_avg: bill.attributes.amount_avg,
                    amount_min: bill.attributes.amount_min,
                    amount_max: bill.attributes.amount_max,
                },
                'Invalid bill amount, defaulting to 0'
            );
            return 0;
        }

        return amount;
    }

    /**
     * Expected versus paid per bill (R-BILL-1). Expected is the bill's amount
     * for every date it falls due this month; paid is the bill bucket.
     */
    private calculateBillDetails(
        bills: BillRead[],
        transactions: TransactionSplit[],
        month: number,
        year: number
    ): {
        predictedTotal: number;
        actualTotal: number;
        billDetails: BillDetailDto[];
    } {
        const todayDay = today();
        let predictedTotal = 0;
        let actualTotal = 0;
        const billDetails: BillDetailDto[] = [];

        const billTransactionMap = new Map<string, TransactionSplit[]>();
        for (const transaction of transactions) {
            // Same test as isBill, so every transaction in the bill bucket has a key
            const billId = transaction.bill_id || transaction.subscription_id;
            if (billId) {
                billTransactionMap.getOrInsert(billId, []).push(transaction);
            }
        }

        for (const bill of bills) {
            const billId = bill.id;
            const billTransactions = billTransactionMap.get(billId) ?? [];
            billTransactionMap.delete(billId);

            // A deactivated bill predicts nothing; it is listed only so spending
            // still linked to it is counted
            const isActive = bill.attributes.active ?? false;
            const dueDates = isActive ? dueDatesInMonth(bill, month, year) : [];

            // A bill that neither falls due nor sees any activity this month is
            // not worth a row: it would render as "$0.00 (expected $0.00)"
            if (dueDates.length === 0 && billTransactions.length === 0) {
                continue;
            }

            const amount = this.getBillAmount(bill);
            // Net spend: a refund linked to the bill reduces what it cost
            const actualAmount = TransactionCalculationUtils.calculateNetSpend(
                billTransactions,
                logger
            );
            const predictedAmount = amount * dueDates.length;
            const upcoming = isActive
                ? this.unpaidDatesInMonth(bill, month, year).filter(day => day >= todayDay)
                : [];
            const outstanding = amount * upcoming.length;

            actualTotal += actualAmount;
            predictedTotal += predictedAmount;

            logger.debug(
                {
                    billId,
                    billName: bill.attributes.name,
                    dueDates,
                    upcoming,
                    predictedAmount,
                    actualAmount,
                },
                'Compared bill'
            );

            billDetails.push(
                new BillDetailDto(
                    billId,
                    bill.attributes.name ?? 'Unknown Bill',
                    predictedAmount,
                    actualAmount,
                    bill.attributes.repeat_freq ?? 'monthly',
                    upcoming.length > 0 ? new Date(`${upcoming[0]}T00:00:00`) : undefined,
                    outstanding
                )
            );
        }

        // Anything still in the map links to a bill this month's bill list does
        // not contain - a deleted bill, most often. Every other bucket rejects a
        // bill-linked transaction, so without this it would vanish from the net.
        for (const [billId, orphanTransactions] of billTransactionMap) {
            const orphanAmount = TransactionCalculationUtils.calculateNetSpend(
                orphanTransactions,
                logger
            );

            actualTotal += orphanAmount;

            logger.warn(
                {
                    billId,
                    transactionCount: orphanTransactions.length,
                    orphanAmount,
                    month,
                    year,
                },
                'Transactions reference a bill that is not in the bill list - counted as bills paid with no prediction'
            );

            billDetails.push(
                new BillDetailDto(billId, `Unknown Bill (#${billId})`, 0, orphanAmount, 'unknown')
            );
        }

        logger.debug({ predictedTotal, actualTotal, billDetailsCount: billDetails.length });

        return { predictedTotal, actualTotal, billDetails };
    }
}
