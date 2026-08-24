import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { BaseTransactionAnalysisService } from './core/base-transaction-analysis.service.js';
import { StringUtils } from '../utils/string.utils.js';
import { AccountScopeService } from './core/account-scope.service.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';

/**
 * Service for calculating additional income.
 *
 * Extends BaseTransactionAnalysisService for consistent error handling and Result types.
 *
 * A transaction is considered additional income if:
 * - It is a deposit (not a withdrawal or transfer)
 * - It goes to a valid destination account
 * - It is not tagged as a paycheck (PaycheckSurplusService owns those)
 * - It is not payroll
 * - It is not disposable income (if configured)
 * - It is not in the excluded transactions list
 *
 * Description matching is normalized to handle variations (case insensitive, trimmed, etc.)
 */
export class AdditionalIncomeService extends BaseTransactionAnalysisService<TransactionSplit[]> {
    constructor(
        transactionService: ITransactionService,
        transactionClassificationService: ITransactionClassificationService,
        private readonly accountScope: AccountScopeService,
        private readonly excludedAdditionalIncomePatterns: readonly string[],
        private readonly excludeDisposableIncome: boolean
    ) {
        super(transactionService, transactionClassificationService);
        this.validateConfig();
    }

    /**
     * Calculates additional income for a given month and year.
     * Returns Result type for explicit error handling.
     *
     * @param month - Month to calculate (1-12)
     * @param year - Year to calculate
     * @returns Result containing array of additional income transactions or error
     */
    async calculateAdditionalIncome(month: number, year: number) {
        return this.executeAnalysis(month, year);
    }

    /**
     * Analyzes transactions to identify additional income.
     * Implements domain-specific filtering logic.
     */
    protected async analyzeTransactions(
        transactions: TransactionSplit[]
    ): Promise<TransactionSplit[]> {
        if (!transactions?.length) {
            this.logger.debug('No transactions provided for analysis');
            return [];
        }

        // Resolved here rather than injected: the scope is derived from Firefly
        // and the factory that builds this service is synchronous.
        const validDestinationAccounts = await this.accountScope.getIncomeDestinations();
        const additionalIncome = this.filterTransactions(transactions, validDestinationAccounts);

        if (!additionalIncome.length) {
            this.logger.debug('No additional income found after filtering');
        }

        return additionalIncome;
    }

    protected getOperationName(): string {
        return 'calculateAdditionalIncome';
    }

    /**
     * Validates the configuration to ensure it's valid.
     *
     * Must have at least one valid destination account
     */
    private validateConfig(): void {
        if (!this.excludedAdditionalIncomePatterns.length) {
            this.logger.warn(
                'No excluded descriptions specified - all deposits will be considered additional income'
            );
        }
    }

    /**
     * Filters transactions to find additional income.
     *
     * 1. Must be a deposit
     * 2. Must go to a valid destination account
     * 3. Must not be a paycheck — those are counted by PaycheckSurplusService,
     *    and counting them here too would double-count income in the net
     * 4. Must not match an excluded description pattern
     * 5. Must have a positive amount
     * 6. Must not be disposable income (if configured)
     */
    private filterTransactions(
        transactions: TransactionSplit[],
        validDestinationAccounts: string[]
    ): TransactionSplit[] {
        return transactions.filter(
            transaction =>
                this.transactionClassificationService.isDeposit(transaction) &&
                this.hasValidDestinationAccount(transaction, validDestinationAccounts) &&
                !this.transactionClassificationService.isPaycheck(transaction) &&
                this.isNotPayroll(transaction) &&
                TransactionCalculationUtils.parseAmountSafe(transaction.amount) > 0 &&
                (!this.excludeDisposableIncome ||
                    !this.transactionClassificationService.isDisposableIncome(transaction))
        );
    }

    /**
     * Checks if a transaction goes to a valid destination account.
     *
     * 1. Must have a destination account
     * 2. Destination account must be in the valid accounts list
     */
    private hasValidDestinationAccount = (
        transaction: TransactionSplit,
        validDestinationAccounts: string[]
    ): boolean =>
        transaction.destination_id != null &&
        validDestinationAccounts.includes(transaction.destination_id);

    /**
     * Checks if a transaction is not payroll.
     *
     * 1. Normalizes the description using StringUtils
     * 2. Checks if it matches any excluded descriptions
     * 3. Returns true if it doesn't match any excluded descriptions
     */
    private isNotPayroll = (transaction: TransactionSplit): boolean => {
        if (!transaction.description) {
            this.logger.warn({ transaction }, 'Transaction found with no description');
            return true; // Consider non-described transactions as non-payroll
        }

        return !StringUtils.matchesAnyPattern(
            transaction.description,
            this.excludedAdditionalIncomePatterns
        );
    };
}
