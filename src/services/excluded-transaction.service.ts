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
 * A rule matches on description, optionally narrowed to a single amount; see
 * `ExcludedTransaction` for the full contract. Amount-only rules are not
 * supported and are rejected by `ConfigValidator` before they reach here.
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
            // Description is required. The validator rejects a rule without one,
            // so this only guards against a service constructed directly — but
            // matching on amount alone would drop every transaction of that
            // amount on every account, so never fall back to it.
            if (!transaction.description) {
                return false;
            }

            if (
                StringUtils.normalizeForMatching(transaction.description) !==
                StringUtils.normalizeForMatching(description)
            ) {
                return false;
            }

            // No amount on the rule: description alone decides
            if (!transaction.amount) {
                return true;
            }

            // Parse the configured amount the same way as the transaction's, so
            // a currency-formatted rule ("$1,200.00") cannot silently mean
            // something else than it reads. NaN keeps an unparseable rule
            // non-matching rather than throwing mid-fetch.
            const ruleAmount = TransactionCalculationUtils.parseAmountSafe(transaction.amount, NaN);

            return Math.abs(ruleAmount) === Math.abs(convertedAmount);
        });

        if (isExcluded) {
            this.logger.debug({ description, amount }, 'Transaction matched exclusion criteria');
        }

        return isExcluded;
    }
}
