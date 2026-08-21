import { logger as defaultLogger } from '../logger.js';
import { IExcludedTransactionService } from './excluded-transaction.service.interface.js';
import { ILogger } from '../types/interface/logger.interface.js';
import { ExcludedTransaction } from '../config/config.types.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { StringUtils } from '../utils/string.utils.js';

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

    isExcludedTransaction(description: string, amount: string): boolean {
        // NaN never equals anything, so an unparseable amount simply fails
        // amount-based matches instead of aborting the whole transaction fetch
        const convertedAmount = TransactionCalculationUtils.parseAmountSafe(amount, NaN);

        const isExcluded = this.excludedTransactions.some(transaction => {
            // Both description and amount must match
            if (transaction.description && transaction.amount) {
                return (
                    StringUtils.normalizeForMatching(transaction.description) ===
                        StringUtils.normalizeForMatching(description) &&
                    Math.abs(parseFloat(transaction.amount)) === Math.abs(convertedAmount)
                );
            }

            // Only description needs to match
            if (transaction.description && !transaction.amount) {
                return (
                    StringUtils.normalizeForMatching(transaction.description) ===
                    StringUtils.normalizeForMatching(description)
                );
            }

            // Only amount needs to match
            if (!transaction.description && transaction.amount) {
                return Math.abs(parseFloat(transaction.amount)) === Math.abs(convertedAmount);
            }

            return false;
        });

        if (isExcluded) {
            this.logger.debug({ description, amount }, 'Transaction matched exclusion criteria');
        }

        return isExcluded;
    }
}
