import { BillRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../logger.js';
import { BillComparisonDto, BillDetailDto } from '../types/dto/bill-comparison.dto.js';
import { BillComparisonService as IBillComparisonService } from '../types/interface/bill-comparison.service.interface.js';
import { DateUtils } from '../utils/date.utils.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { BillService } from './core/bill.service.js';
import { ITransactionService } from './core/transaction.service.interface.js';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { Result } from '../types/result.type.js';
import { BillError, BillErrorFactory, BillErrorType } from '../types/error/bill.error.js';

export class BillComparisonService implements IBillComparisonService {
    constructor(
        private readonly billService: BillService,
        private readonly transactionService: ITransactionService,
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

            // Get actual transactions for the specific month
            const transactions = await this.transactionService.getTransactionsForMonth(month, year);

            // Filter to transactions linked to bills
            const billTransactions = transactions.filter(t =>
                this.transactionClassificationService.isBill(t)
            );

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
            const { predictedTotal, actualTotal, billDetails, budgetedTransactions } =
                this.calculateBillDetails(bills, billTransactions, month, year);

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
                currencySymbol,
                budgetedTransactions
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
     * Calculate bill details with predicted amounts based on pay_dates.
     * If a bill has a pay_date in the requested period, predicted = bill amount.
     * If a bill has no pay_date in the requested period, predicted = 0.
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
        budgetedTransactions: TransactionSplit[];
    } {
        let predictedTotal = 0;
        let actualTotal = 0;
        const billDetails: BillDetailDto[] = [];
        // Bill transactions that also carry a budget. Collected only for bills
        // actually summed into actualTotal, so the analyze report's correction
        // matches what was counted rather than what merely exists.
        const budgetedTransactions: TransactionSplit[] = [];

        logger.debug(
            `Calculating bill details from ${transactions.length} bill-linked transactions for ${bills.length} bills`
        );

        // Create a map of bill ID to transactions
        const billTransactionMap = new Map<string, TransactionSplit[]>();
        for (const transaction of transactions) {
            // Use bill_id or subscription_id
            const billId = transaction.bill_id ?? transaction.subscription_id;
            if (billId) {
                billTransactionMap.getOrInsert(billId, []).push(transaction);

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
            const isActive = bill.attributes.active ?? false;

            // A deactivated bill with no activity this month is not worth a row
            if (!isActive && billTransactions.length === 0) {
                billTransactionMap.delete(billId);
                continue;
            }

            // Net spend for this bill: a refund or returned payment linked to
            // the bill reduces what was actually paid, it does not add to it
            const actualAmount = TransactionCalculationUtils.calculateNetSpend(
                billTransactions,
                logger
            );

            actualTotal += actualAmount;

            budgetedTransactions.push(
                ...billTransactions.filter(t => this.transactionClassificationService.hasBudget(t))
            );

            // Predicted amount determination with defensive logic:
            // 1. If bill is marked as due (has pay_dates) → use full bill amount
            // 2. If bill is NOT marked as due BUT has actual transactions → use full bill amount (Firefly III bug workaround)
            // 3. If bill is NOT marked as due AND has no transactions → use 0
            // (represents what's actually owed this month, not the monthly budget equivalent)
            // A deactivated bill predicts nothing - it is only here so its
            // actual spending is not dropped on the floor
            const isDue = isActive && this.isBillDueThisMonth(bill, month, year);
            const hasActualTransactions = isActive && billTransactions.length > 0;

            // Defensive logic: If bill has transactions but pay_dates is empty,
            // assume Firefly III bug and treat as due
            let predictedAmount: number;
            let usedFallbackLogic = false;

            if (isDue) {
                // Normal case: bill is marked as due in pay_dates
                predictedAmount = this.getBillAmount(bill);
            } else if (!isDue && hasActualTransactions) {
                // Defensive case: pay_dates is empty but transactions exist
                // This handles Firefly III bug where pay_dates may not be populated
                predictedAmount = this.getBillAmount(bill);
                usedFallbackLogic = true;

                logger.debug(
                    {
                        billName: bill.attributes.name,
                        billId,
                        actualAmount,
                        predictedAmount,
                        transactionCount: billTransactions.length,
                        payDates: bill.attributes.pay_dates,
                        month,
                        year,
                    },
                    'Bill has transactions but no pay_dates - using fallback logic to set expected amount'
                );
            } else {
                // Normal case: bill is not due and has no transactions
                predictedAmount = 0;
            }

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
                usedFallbackLogic,
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

            billTransactionMap.delete(billId);
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
            budgetedTransactions.push(
                ...orphanTransactions.filter(t =>
                    this.transactionClassificationService.hasBudget(t)
                )
            );

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

        return { predictedTotal, actualTotal, billDetails, budgetedTransactions };
    }
}
