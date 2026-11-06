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
 * See `ExcludedTransaction` for how a rule matches. `ConfigValidator` reports a
 * bad rule at startup; the constructor refuses one regardless.
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
 * @throws when the rule has no description (it would drop every transaction of
 *   that amount, or every one without a description) or an unparseable amount
 */
function toRule({ description, amount }: ExcludedTransaction, index: number): ExclusionRule {
    if (typeof description !== 'string' || !description.trim()) {
        throw new Error(
            `Excluded transaction ${index} has no description; a rule without one would exclude unrelated transactions`
        );
    }
    const parsedAmount = amount ? TransactionCalculationUtils.parseAmount(amount) : undefined;
    if (amount && parsedAmount === undefined) {
        throw new Error(`Excluded transaction ${index} has an invalid amount: ${amount}`);
    }
    return {
        description: StringUtils.normalizeForMatching(description),
        amount: parsedAmount === undefined ? undefined : Math.abs(parsedAmount),
    };
}
