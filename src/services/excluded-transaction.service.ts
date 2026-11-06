import { logger as defaultLogger } from '../logger.js';
import { IExcludedTransactionService } from './excluded-transaction.service.interface.js';
import { ILogger } from '../types/interface/logger.interface.js';
import { ExcludedTransaction } from '../config/config.types.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';
import { StringUtils } from '../utils/string.utils.js';

/** An {@link ExcludedTransaction} as it is matched */
interface ExclusionRule {
    /** Normalized with StringUtils.normalizeForMatching */
    description: string;
    /** Absolute amount; undefined when description alone decides */
    amount?: number;
}

/**
 * Service for managing excluded transactions.
 *
 * Excluded transactions are configured in the YAML file and injected via constructor.
 * A rule matches on description, optionally narrowed to a single amount; see
 * `ExcludedTransaction` for the full contract. `ConfigValidator` rejects a rule
 * without a description or with an unparseable amount before it reaches here.
 */
export class ExcludedTransactionService implements IExcludedTransactionService {
    private readonly rules: readonly ExclusionRule[];
    private readonly logger: ILogger;

    constructor(excludedTransactions: ExcludedTransaction[], logger: ILogger = defaultLogger) {
        this.rules = excludedTransactions.map(toRule);
        this.logger = logger;
    }

    isExcludedTransaction(description: string, amount: string): boolean {
        const normalizedDescription = StringUtils.normalizeForMatching(description);
        // NaN never equals anything, so an unparseable amount simply fails
        // amount-based matches instead of aborting the whole transaction fetch
        const absoluteAmount = Math.abs(TransactionCalculationUtils.parseAmount(amount) ?? NaN);

        const isExcluded = this.rules.some(
            rule =>
                rule.description === normalizedDescription &&
                (rule.amount === undefined || rule.amount === absoluteAmount)
        );

        if (isExcluded) {
            this.logger.debug({ description, amount }, 'Transaction matched exclusion criteria');
        }

        return isExcluded;
    }
}

/**
 * The configured amount is parsed the same way as the transaction's, so a
 * currency-formatted rule ("$1,200.00") cannot silently mean something other
 * than it reads.
 */
function toRule({ description, amount }: ExcludedTransaction): ExclusionRule {
    return {
        description: StringUtils.normalizeForMatching(description),
        amount: amount
            ? Math.abs(TransactionCalculationUtils.parseAmount(amount) ?? NaN)
            : undefined,
    };
}
