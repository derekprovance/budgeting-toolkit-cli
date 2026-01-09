import { BillRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../logger.js';
import { BillComparisonDto, BillDetailDto } from '../types/dto/bill-comparison.dto.js';
import { BillComparisonService as IBillComparisonService } from '../types/interface/bill-comparison.service.interface.js';
import { DateUtils } from '../utils/date.utils.js';
import { BillService } from './core/bill.service.js';
import { TransactionService } from './core/transaction.service.js';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { Result } from '../types/result.type.js';
import { BillError, BillErrorFactory, BillErrorType } from '../types/error/bill.error.js';

export class BillComparisonService implements IBillComparisonService {
    constructor(
        private readonly billService: BillService,
        private readonly transactionService: TransactionService,
        private readonly transactionClassificationService: ITransactionClassificationService
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

        // Validate date
        try {
            DateUtils.validateMonthYear(month, year);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.warn({ month, year, operation, error: err.message }, 'Invalid date parameters');

            return Result.err(
                BillErrorFactory.create(BillErrorType.INVALID_DATE, month, year, operation, err)
            );
        }

        try {
            // Get active bills with pay_dates populated for this month
            const activeBills = await this.billService.getActiveBillsForMonth(month, year);

            if (activeBills.length === 0) {
                logger.debug('No active bills found for year ' + year);
                // Not an error - just return empty result
                return Result.ok(BillComparisonDto.create(0, 0, [], 'USD', '$'));
            }

            // Get actual transactions for the specific month
            const transactions = await this.transactionService.getTransactionsForMonth(month, year);

            // Filter to transactions linked to bills
            const billTransactions = transactions.filter(t =>
                this.transactionClassificationService.isBill(t)
            );

            // Calculate bill details with predicted amounts based on pay_dates
            const { predictedTotal, actualTotal, billDetails } = this.calculateBillDetails(
                activeBills,
                billTransactions,
                month,
                year
            );

            // Get currency info from first bill or use default
            const currencyCode =
                activeBills[0]?.attributes.currency_code ??
                activeBills[0]?.attributes.primary_currency_code ??
                'USD';
            const currencySymbol =
                activeBills[0]?.attributes.currency_symbol ??
                activeBills[0]?.attributes.primary_currency_symbol ??
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
                    billCount: activeBills.length,
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
     * Gets the top N bills by actual amount spent
     * @param comparison Bill comparison data
     * @param limit Number of bills to return (default: 4)
     * @returns Top N bills sorted by actual amount descending
     */
    getTopBills(comparison: BillComparisonDto, limit: number = 4): BillDetailDto[] {
        return [...comparison.bills].sort((a, b) => b.actual - a.actual).slice(0, limit);
    }

    /**
     * Gets the remaining bills after top N
     * @param comparison Bill comparison data
     * @param limit Number of top bills (default: 4)
     * @returns Remaining bills (those not in top N)
     */
    getRemainingBills(comparison: BillComparisonDto, limit: number = 4): BillDetailDto[] {
        return [...comparison.bills].sort((a, b) => b.actual - a.actual).slice(limit);
    }

    /**
     * Check if a bill has a payment date within the requested month and year.
     * Verifies that the pay_dates actually fall within the specified month/year.
     */
    private isBillDueThisMonth(bill: BillRead, month: number, year: number): boolean {
        const payDates = bill.attributes.pay_dates;
        if (!Array.isArray(payDates) || payDates.length === 0) {
            return false;
        }

        // Check if any pay_date falls within the requested month/year
        return payDates.some(dateStr => {
            const date = new Date(dateStr);
            return date.getUTCMonth() + 1 === month && date.getUTCFullYear() === year;
        });
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
            logger.warn(
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
     * Calculate bill details with predicted amounts based on pay_dates.
     * If a bill has a pay_date in the requested period, predicted = bill amount.
     * If a bill has no pay_date in the requested period, predicted = 0.
     */
    private calculateBillDetails(
        bills: BillRead[],
        transactions: TransactionSplit[],
        month: number,
        year: number
    ): { predictedTotal: number; actualTotal: number; billDetails: BillDetailDto[] } {
        let predictedTotal = 0;
        let actualTotal = 0;
        const billDetails: BillDetailDto[] = [];

        logger.debug(
            `Calculating bill details from ${transactions.length} bill-linked transactions for ${bills.length} bills`
        );

        // Create a map of bill ID to transactions
        const billTransactionMap = new Map<string, TransactionSplit[]>();
        for (const transaction of transactions) {
            // Use bill_id or subscription_id
            const billId = transaction.bill_id ?? transaction.subscription_id;
            if (billId) {
                if (!billTransactionMap.has(billId)) {
                    billTransactionMap.set(billId, []);
                }
                billTransactionMap.get(billId)!.push(transaction);

                logger.debug({
                    transactionDesc: transaction.description,
                    transactionAmount: transaction.amount,
                    linkedBillId: billId,
                    transactionDate: transaction.date,
                });
            }
        }

        // Build details for each bill
        for (const bill of bills) {
            const billId = bill.id;
            const billTransactions = billTransactionMap.get(billId) ?? [];
            const frequency = bill.attributes.repeat_freq ?? 'monthly';

            // Calculate actual amount for this bill (sum of all transactions)
            const actualAmount = billTransactions.reduce((sum, t) => {
                return sum + Math.abs(parseFloat(t.amount));
            }, 0);

            actualTotal += actualAmount;

            // Predicted amount: full bill amount if due this month, 0 if not
            // (represents what's actually owed this month, not the monthly budget equivalent)
            const isDue = this.isBillDueThisMonth(bill, month, year);
            const predictedAmount = isDue ? this.getBillAmount(bill) : 0;

            predictedTotal += predictedAmount;

            logger.debug({
                billName: bill.attributes.name,
                billId,
                isDue,
                payDates: bill.attributes.pay_dates,
                frequency: bill.attributes.repeat_freq ?? 'monthly',
                fullAmount: this.getBillAmount(bill),
                predictedAmount,
                transactionCount: billTransactions.length,
                actualAmount,
            });

            billDetails.push(
                new BillDetailDto(
                    billId,
                    bill.attributes.name ?? 'Unknown Bill',
                    predictedAmount,
                    actualAmount,
                    frequency
                )
            );
        }

        logger.debug({ predictedTotal, actualTotal, billDetailsCount: billDetails.length });

        return { predictedTotal, actualTotal, billDetails };
    }
}
