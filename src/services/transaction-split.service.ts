import {
    TransactionRead,
    TransactionSplit,
    TransactionUpdate,
    TransactionSplitUpdate,
} from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../api/firefly-client-with-certs.js';
import { logger as defaultLogger } from '../logger.js';
import { ILogger } from '../types/interface/logger.interface.js';
import { errorMessage } from '../utils/error-detection.utils.js';

/**
 * Data for a single split portion
 */
export interface SplitData {
    amount: string;
    description?: string;
}

/** The two parts a transaction is split into: the first keeps the original journal */
export type SplitParts = readonly [SplitData, SplitData];

/**
 * Service for splitting transactions into multiple parts
 */
export class TransactionSplitService {
    private readonly logger: ILogger;

    constructor(
        private readonly client: FireflyClientWithCerts,
        logger: ILogger = defaultLogger
    ) {
        this.logger = logger;
    }

    /**
     * Fetches the one split of a transaction that can be split.
     * @throws when the transaction is missing, already split or has no splits,
     *   and when Firefly cannot be reached or refuses the request
     */
    async getSingleSplit(transactionId: string): Promise<TransactionSplit> {
        const splits = (await this.fetchTransaction(transactionId)).attributes.transactions;

        if (splits.length === 0) {
            throw new Error(`Transaction ${transactionId} has no splits`);
        }
        if (splits.length > 1) {
            throw new Error(
                `Transaction ${transactionId} already has ${splits.length} splits. Only single transactions can be split.`
            );
        }
        return splits[0];
    }

    /**
     * Splits a transaction into two parts
     * @param transactionId The ID of the transaction to split
     * @param originalSplit Its only split, from getSingleSplit
     * @param parts The first part keeps the original's category, budget and
     *   tags; the second is left for manual assignment. Their amounts must sum
     *   to the original's: the first is checked by validateSplitAmount
     *   (split-amount.utils) and the second is its remainderAmount
     * @returns The updated transaction
     * @throws when Firefly rejects the update
     */
    async splitTransaction(
        transactionId: string,
        originalSplit: TransactionSplit,
        parts: SplitParts
    ): Promise<TransactionRead> {
        const updatePayload = this.createSplitPayload(originalSplit, parts);

        this.logger.debug(
            {
                transactionId,
                originalAmount: originalSplit.amount,
                partAmounts: parts.map(part => part.amount),
            },
            'Splitting transaction'
        );

        const updated = await this.sendUpdate(transactionId, updatePayload);

        this.logger.debug(
            {
                transactionId,
                splitsCreated: updated.attributes.transactions.length,
            },
            'Transaction split successfully'
        );

        return updated;
    }

    private async fetchTransaction(transactionId: string): Promise<TransactionRead> {
        const response = await this.client.transactions
            .getTransaction(transactionId)
            .catch((error: unknown) => {
                throw new Error(
                    `Failed to fetch transaction ${transactionId}: ${errorMessage(error)}`,
                    { cause: error }
                );
            });
        if (!response?.data) {
            throw new Error(`Transaction ${transactionId} not found`);
        }
        return response.data;
    }

    private async sendUpdate(
        transactionId: string,
        payload: TransactionUpdate
    ): Promise<TransactionRead> {
        try {
            const response = await this.client.transactions.updateTransaction(
                transactionId,
                payload
            );
            return response.data;
        } catch (error) {
            throw new Error(
                `Failed to split transaction ${transactionId}: ${errorMessage(error)}`,
                { cause: error }
            );
        }
    }

    /**
     * Creates the TransactionUpdate payload for splitting
     */
    private createSplitPayload(
        originalSplit: TransactionSplit,
        [firstData, secondData]: SplitParts
    ): TransactionUpdate {
        const foreign = this.splitForeignAmount(originalSplit, firstData.amount);

        // First split: Update original transaction (preserves journal ID)
        const firstSplitUpdate: TransactionSplitUpdate = {
            transaction_journal_id: originalSplit.transaction_journal_id,
            amount: firstData.amount,
            description: firstData.description || originalSplit.description,
            // Copy tags from original transaction
            ...(originalSplit.tags && { tags: originalSplit.tags }),
            // Preserve category from original
            ...(originalSplit.category_name && { category_name: originalSplit.category_name }),
            // Preserve budget from original
            ...(originalSplit.budget_id && { budget_id: originalSplit.budget_id }),
            ...(foreign && { ...foreign.currency, foreign_amount: foreign.amounts[0] }),
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
            ...(foreign && { ...foreign.currency, foreign_amount: foreign.amounts[1] }),
        };

        return {
            apply_rules: true,
            fire_webhooks: true,
            group_title: originalSplit.description,
            transactions: [firstSplitUpdate, secondSplitUpdate],
        };
    }

    /**
     * Divides the foreign amount in the same proportion as the amount, in the
     * foreign currency's own smallest unit (JPY has none below 1), with the
     * remainder on the second part so the two sum exactly. Without it Firefly
     * keeps the full foreign amount on the first split.
     * @returns undefined when the original carries no foreign amount
     */
    private splitForeignAmount(
        originalSplit: TransactionSplit,
        firstAmount: string
    ):
        | {
              amounts: [string, string];
              currency: Pick<
                  TransactionSplitUpdate,
                  'foreign_currency_id' | 'foreign_currency_code'
              >;
          }
        | undefined {
        const decimals = originalSplit.foreign_currency_decimal_places ?? 2;
        const unit = 10 ** decimals;
        const foreignUnits = Math.round(parseFloat(originalSplit.foreign_amount ?? '') * unit);
        const total = parseFloat(originalSplit.amount);
        if (!(foreignUnits > 0) || !(total > 0)) {
            return undefined;
        }

        const firstUnits = Math.round((foreignUnits * parseFloat(firstAmount)) / total);
        return {
            amounts: [
                (firstUnits / unit).toFixed(decimals),
                ((foreignUnits - firstUnits) / unit).toFixed(decimals),
            ],
            currency: {
                ...(originalSplit.foreign_currency_id && {
                    foreign_currency_id: originalSplit.foreign_currency_id,
                }),
                ...(originalSplit.foreign_currency_code && {
                    foreign_currency_code: originalSplit.foreign_currency_code,
                }),
            },
        };
    }
}
