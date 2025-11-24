import {
    TransactionRead,
    TransactionSplit,
    TransactionUpdate,
    TransactionSplitUpdate,
} from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../api/firefly-client-with-certs.js';
import { logger as defaultLogger } from '../logger.js';
import { ILogger } from '../types/interface/logger.interface.js';

/**
 * Data for a single split portion
 */
export interface SplitData {
    amount: string;
    description?: string;
}

/**
 * Result of a split operation
 */
export interface SplitResult {
    success: boolean;
    transaction?: TransactionRead;
    error?: Error;
}

/**
 * Service for splitting transactions into multiple parts
 */
export class TransactionSplitService {
    /**
     * Tolerance for floating point comparison in currency calculations.
     * Set to 0.01 (1 cent) to accommodate rounding differences.
     */
    private static readonly CURRENCY_COMPARISON_EPSILON = 0.01;

    private readonly logger: ILogger;

    constructor(
        private readonly client: FireflyClientWithCerts,
        logger: ILogger = defaultLogger
    ) {
        this.logger = logger;
    }

    /**
     * Fetches a transaction by ID
     * @param transactionId The ID of the transaction to fetch
     * @returns The transaction data or undefined if not found
     */
    async getTransaction(transactionId: string): Promise<TransactionRead | undefined> {
        try {
            const response = await this.client.transactions.getTransaction(transactionId);
            return response?.data;
        } catch (error) {
            this.logger.error(
                {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    transactionId,
                },
                'Failed to fetch transaction'
            );
            return undefined;
        }
    }

    /**
     * Splits a transaction into two parts
     * @param transactionId The ID of the transaction to split
     * @param firstSplitAmount Amount for the first split (original will be updated to this)
     * @param firstSplitData Data for the first split (category, budget, description with optional custom text)
     * @param secondSplitData Data for the second split (remainder with optional custom text)
     * @returns SplitResult with success status and updated transaction or error
     */
    async splitTransaction(
        transactionId: string,
        firstSplitAmount: string,
        firstSplitData: SplitData,
        secondSplitData: SplitData
    ): Promise<SplitResult> {
        try {
            // Fetch the original transaction
            const originalTransaction =
                await this.client.transactions.getTransaction(transactionId);

            if (!originalTransaction?.data) {
                throw new Error(`Transaction ${transactionId} not found`);
            }

            const transactionData = originalTransaction.data;
            const splits = transactionData.attributes.transactions;

            if (!splits || splits.length === 0) {
                throw new Error(`Transaction ${transactionId} has no splits`);
            }

            // For now, we only support splitting single-split transactions
            if (splits.length > 1) {
                throw new Error(
                    `Transaction ${transactionId} already has ${splits.length} splits. Only single transactions can be split.`
                );
            }

            const originalSplit = splits[0];

            // Validate the split amounts
            const originalAmount = parseFloat(originalSplit.amount);
            const firstAmount = parseFloat(firstSplitAmount);
            const secondAmount = parseFloat(secondSplitData.amount);

            if (!this.validateSplitAmounts(originalAmount, [firstAmount, secondAmount])) {
                throw new Error(
                    `Split amounts (${firstAmount} + ${secondAmount} = ${firstAmount + secondAmount}) ` +
                        `do not equal original amount (${originalAmount})`
                );
            }

            // Build the update payload
            const updatePayload = this.createSplitPayload(
                originalSplit,
                firstSplitAmount,
                firstSplitData,
                secondSplitData
            );

            this.logger.debug(
                {
                    transactionId,
                    originalAmount,
                    firstAmount,
                    secondAmount,
                },
                'Splitting transaction'
            );

            // Execute the split via SDK
            const result = await this.client.transactions.updateTransaction(
                transactionId,
                updatePayload
            );

            this.logger.debug(
                {
                    transactionId,
                    splitsCreated: result.data?.attributes.transactions?.length,
                },
                'Transaction split successfully'
            );

            return {
                success: true,
                transaction: result.data,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

            this.logger.error(
                {
                    error: errorMessage,
                    transactionId,
                },
                'Failed to split transaction'
            );

            return {
                success: false,
                error: error instanceof Error ? error : new Error(errorMessage),
            };
        }
    }

    /**
     * Validates that split amounts sum to the original amount
     * @param originalAmount The original transaction amount
     * @param splitAmounts Array of split amounts to validate
     * @returns true if valid, false otherwise
     */
    validateSplitAmounts(originalAmount: number, splitAmounts: number[]): boolean {
        if (splitAmounts.some(amount => amount <= 0)) {
            this.logger.error('Split amounts must be greater than zero');
            return false;
        }

        const sum = splitAmounts.reduce((acc, amount) => acc + amount, 0);

        // Use epsilon for floating point comparison
        const isValid =
            Math.abs(sum - originalAmount) < TransactionSplitService.CURRENCY_COMPARISON_EPSILON;

        if (!isValid) {
            this.logger.error(
                {
                    originalAmount,
                    splitAmounts,
                    sum,
                    difference: sum - originalAmount,
                },
                'Split amounts do not sum to original amount'
            );
        }

        return isValid;
    }

    /**
     * Creates the TransactionUpdate payload for splitting
     * @param originalSplit The original transaction split
     * @param firstAmount Amount for the first split
     * @param firstData Data for the first split (description should include original + custom text)
     * @param secondData Data for the second split (description should include original + custom text)
     * @returns TransactionUpdate payload
     */
    private createSplitPayload(
        originalSplit: TransactionSplit,
        firstAmount: string,
        firstData: SplitData,
        secondData: SplitData
    ): TransactionUpdate {
        // First split: Update original transaction (preserves journal ID)
        const firstSplitUpdate: TransactionSplitUpdate = {
            transaction_journal_id: originalSplit.transaction_journal_id,
            amount: firstAmount,
            description: firstData.description || originalSplit.description,
            // Copy tags from original transaction
            ...(originalSplit.tags && { tags: originalSplit.tags }),
            // Preserve category from original
            ...(originalSplit.category_name && { category_name: originalSplit.category_name }),
            // Preserve budget from original
            ...(originalSplit.budget_id && { budget_id: originalSplit.budget_id }),
        };

        // Second split: Create new transaction (no journal ID)
        const secondSplitUpdate: TransactionSplitUpdate = {
            type: originalSplit.type,
            date: originalSplit.date,
            amount: secondData.amount,
            description: secondData.description || originalSplit.description,

            // Copy account information from original
            source_id: originalSplit.source_id,
            source_name: originalSplit.source_name,
            destination_id: originalSplit.destination_id,
            destination_name: originalSplit.destination_name,

            // Copy currency information
            ...(originalSplit.currency_id && { currency_id: originalSplit.currency_id }),
            ...(originalSplit.currency_code && { currency_code: originalSplit.currency_code }),
        };

        return {
            apply_rules: true,
            fire_webhooks: true,
            group_title: originalSplit.description,
            transactions: [firstSplitUpdate, secondSplitUpdate],
        };
    }
}
