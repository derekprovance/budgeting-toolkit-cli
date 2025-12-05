import { ExcludedTransactionDto } from '../types/common.types.js';
import { logger as defaultLogger } from '../logger.js';
import { IExcludedTransactionService } from './excluded-transaction.service.interface.js';
import { ILogger } from '../types/interface/logger.interface.js';
import { ExcludedTransaction } from '../config/config.types.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';

/**
 * Service for managing excluded transactions.
 *
 * Excluded transactions are configured in the YAML file and injected via constructor.
 * This allows certain transactions to be filtered out from processing based on
 * description and/or amount.
 */
export class ExcludedTransactionService implements IExcludedTransactionService {
    private readonly excludedTransactions: ExcludedTransaction[];
    private readonly logger: ILogger;

    constructor(excludedTransactions: ExcludedTransaction[], logger: ILogger = defaultLogger) {
        this.excludedTransactions = excludedTransactions;
        this.logger = logger;
    }

    async getExcludedTransactions(): Promise<ExcludedTransactionDto[]> {
        this.logger.trace(
            { count: this.excludedTransactions.length },
            'Returning excluded transactions from configuration'
        );

        return this.excludedTransactions.map(transaction => ({
            description: transaction.description,
            amount: transaction.amount,
            reason: transaction.reason || 'Excluded from processing',
        }));
    }

    async isExcludedTransaction(description: string, amount: string): Promise<boolean> {
        const convertedAmount = this.convertCurrencyToFloat(amount);

        const isExcluded = this.excludedTransactions.some(transaction => {
            // Both description and amount must match
            if (transaction.description && transaction.amount) {
                return (
                    transaction.description === description &&
                    Math.abs(parseFloat(transaction.amount)) ===
                        Math.abs(parseFloat(convertedAmount))
                );
            }

            // Only description needs to match
            if (transaction.description && !transaction.amount) {
                return transaction.description === description;
            }

            // Only amount needs to match
            if (!transaction.description && transaction.amount) {
                return (
                    Math.abs(parseFloat(transaction.amount)) ===
                    Math.abs(parseFloat(convertedAmount))
                );
            }

            return false;
        });

        if (isExcluded) {
            this.logger.debug({ description, amount }, 'Transaction matched exclusion criteria');
        }

        return isExcluded;
    }

    private convertCurrencyToFloat(amount: string): string {
        return TransactionCalculationUtils.convertCurrencyToFloat(amount);
    }
}
