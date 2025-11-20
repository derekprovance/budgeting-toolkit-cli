import { BillRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../logger.js';
import { BillComparisonDto, BillDetailDto } from '../types/dto/bill-comparison.dto.js';
import { BillComparisonService as IBillComparisonService } from '../types/interface/bill-comparison.service.interface.js';
import { DateUtils } from '../utils/date.utils.js';
import { BillService } from './core/bill.service.js';
import { TransactionService } from './core/transaction.service.js';

export class BillComparisonService implements IBillComparisonService {
    constructor(
        private readonly billService: BillService,
        private readonly transactionService: TransactionService
    ) {}

    async calculateBillComparison(month: number, year: number): Promise<BillComparisonDto> {
        try {
            DateUtils.validateMonthYear(month, year);

            // Get active bills
            const activeBills = await this.billService.getActiveBills();

            if (activeBills.length === 0) {
                logger.info('No active bills found for year ' + year);
                return BillComparisonDto.create(0, 0, [], 'USD', '$');
            }

            // Calculate predicted monthly average from all active bills
            const predictedMonthlyAverage = this.calculatePredictedMonthlyAverage(activeBills);

            // Get actual transactions for the specific month
            const transactions = await this.transactionService.getTransactionsForMonth(month, year);

            // Filter to transactions linked to bills
            const billTransactions = transactions.filter(t => this.isLinkedToBill(t));

            // Calculate actual costs and build bill details
            const { actualMonthlyTotal, billDetails } = this.calculateActualCosts(
                activeBills,
                billTransactions
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

            return BillComparisonDto.create(
                predictedMonthlyAverage,
                actualMonthlyTotal,
                billDetails,
                currencyCode,
                currencySymbol
            );
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(
                { error, month, year },
                `Failed to calculate bill comparison: ${errorMessage}`
            );
            throw new Error(
                `Failed to calculate bill comparison for month ${month}: ${errorMessage}`
            );
        }
    }

    /**
     * Calculate the predicted monthly average cost from all active bills
     * Prorates bills with different frequencies to monthly equivalents
     */
    private calculatePredictedMonthlyAverage(bills: BillRead[]): number {
        let totalMonthlyEquivalent = 0;

        logger.debug(`Calculating predicted monthly average for ${bills.length} bills`);

        for (const bill of bills) {
            const amount = this.getBillAmount(bill);
            const frequency = bill.attributes.repeat_freq ?? 'monthly';
            const skip = bill.attributes.skip ?? 0;
            const monthlyAmount = this.prorateToMonthly(amount, frequency, skip);

            logger.debug({
                billName: bill.attributes.name,
                billId: bill.id,
                rawAmount: amount,
                frequency,
                skip,
                monthlyAmount,
                runningTotal: totalMonthlyEquivalent + monthlyAmount,
            });

            totalMonthlyEquivalent += monthlyAmount;
        }

        logger.debug({ totalMonthlyEquivalent, billCount: bills.length });

        return totalMonthlyEquivalent;
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
     * Prorate bill amount to monthly equivalent based on frequency and skip
     * @param amount - The bill amount
     * @param frequency - How often the bill repeats (weekly, monthly, etc.)
     * @param skip - How many periods to skip (0 = every period, 1 = every other period, etc.)
     */
    private prorateToMonthly(amount: number, frequency: string, skip: number = 0): number {
        // skip indicates how many periods are skipped
        // skip = 0: every period (weekly, monthly, etc.)
        // skip = 1: every 2 periods (bi-weekly, bi-monthly, etc.)
        // skip = 2: every 3 periods, etc.
        // Defensive: ensure periodMultiplier is at least 1
        const periodMultiplier = Math.max(skip + 1, 1);

        switch (frequency) {
            case 'weekly':
                // Weekly: 52 weeks per year
                // With skip: divide by period multiplier
                return (amount * 52) / periodMultiplier / 12;
            case 'monthly':
                // Monthly: 12 months per year
                // With skip: divide by period multiplier
                return amount / periodMultiplier;
            case 'quarterly':
                // Quarterly: 4 times per year = every 3 months
                // With skip: divide by period multiplier
                return amount / 3 / periodMultiplier;
            case 'half-year':
                // Half-year: 2 times per year = every 6 months
                // With skip: divide by period multiplier
                return amount / 6 / periodMultiplier;
            case 'yearly':
                // Yearly: 1 time per year = every 12 months
                // With skip: divide by period multiplier
                return amount / 12 / periodMultiplier;
            default:
                logger.warn(`Unknown bill frequency: ${frequency}, treating as monthly`);
                return amount / periodMultiplier;
        }
    }

    /**
     * Check if a transaction is linked to a bill
     * Checks both bill_id and subscription_id fields
     */
    private isLinkedToBill(transaction: TransactionSplit): boolean {
        return !!(transaction.bill_id || transaction.subscription_id);
    }

    /**
     * Calculate actual costs from transactions and build bill details
     */
    private calculateActualCosts(
        bills: BillRead[],
        transactions: TransactionSplit[]
    ): { actualMonthlyTotal: number; billDetails: BillDetailDto[] } {
        let actualMonthlyTotal = 0;
        const billDetails: BillDetailDto[] = [];

        logger.debug(
            `Calculating actual costs from ${transactions.length} bill-linked transactions for ${bills.length} bills`
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

            // Calculate actual amount for this bill (sum of all transactions)
            const actualAmount = billTransactions.reduce((sum, t) => {
                return sum + Math.abs(parseFloat(t.amount));
            }, 0);

            actualMonthlyTotal += actualAmount;

            // Calculate predicted amount for this bill
            const billAmount = this.getBillAmount(bill);
            const frequency = bill.attributes.repeat_freq ?? 'monthly';
            const skip = bill.attributes.skip ?? 0;
            const predictedAmount = this.prorateToMonthly(billAmount, frequency, skip);

            if (billTransactions.length > 0) {
                logger.debug({
                    billName: bill.attributes.name,
                    billId,
                    transactionCount: billTransactions.length,
                    actualAmount,
                    predictedAmount,
                });
            }

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

        logger.debug({ actualMonthlyTotal, billDetailsCount: billDetails.length });

        return { actualMonthlyTotal, billDetails };
    }
}
