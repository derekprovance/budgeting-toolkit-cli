import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { BaseTransactionAnalysisService } from './core/base-transaction-analysis.service.js';
import { StringUtils } from '../utils/string.utils.js';

/**
 * Service for calculating additional income.
 *
 * Extends BaseTransactionAnalysisService for consistent error handling and Result types.
 *
 * A transaction is considered additional income if:
 * - It is a deposit (not a withdrawal or transfer)
 * - It goes to a valid destination account
 * - It is not payroll
 * - It meets the minimum amount requirement (if specified)
 * - It is not disposable income (if configured)
 *
 * Description matching is normalized to handle variations (case insensitive, trimmed, etc.)
 */
export class AdditionalIncomeService extends BaseTransactionAnalysisService<TransactionSplit[]> {
    constructor(
        transactionService: ITransactionService,
        transactionClassificationService: ITransactionClassificationService,
        private readonly validDestinationAccounts: string[],
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
    protected analyzeTransactions(transactions: TransactionSplit[]): TransactionSplit[] {
        if (!transactions?.length) {
            this.logger.debug('No transactions provided for analysis');
            return [];
        }

        const additionalIncome = this.filterTransactions(transactions);

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
        if (!this.validDestinationAccounts.length) {
            throw new Error('At least one valid destination account must be specified');
        }

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
     * 3. Must not be payroll
     * 4. Must meet minimum amount requirement
     * 5. Must not be disposable income (if configured)
     */
    private filterTransactions(transactions: TransactionSplit[]): TransactionSplit[] {
        return transactions
            .filter(t => this.transactionClassificationService.isDeposit(t))
            .filter(this.hasValidDestinationAccount)
            .filter(this.isNotPayroll)
            .filter(t => Number(t.amount) > 0)
            .filter(
                t =>
                    !this.excludeDisposableIncome ||
                    !this.transactionClassificationService.isDisposableIncome(t)
            );
    }

    /**
     * Checks if a transaction goes to a valid destination account.
     *
     * 1. Must have a destination account
     * 2. Destination account must be in the valid accounts list
     */
    private hasValidDestinationAccount = (transaction: TransactionSplit): boolean =>
        transaction.destination_id != null &&
        this.validDestinationAccounts.includes(transaction.destination_id);

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
