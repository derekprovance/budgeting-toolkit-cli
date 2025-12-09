import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { BaseTransactionAnalysisService } from './core/base-transaction-analysis.service.js';
import { ILogger } from '../types/interface/logger.interface.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';

/**
 * Service for calculating disposable income transactions.
 *
 * Extends BaseTransactionAnalysisService for consistent error handling and Result types.
 *
 * Identifies transactions tagged with "Disposable Income" and optionally deducts
 * transfers OUT of disposable income accounts to valid destinations.
 *
 * Returns the filtered list of disposable income transactions (before transfers deduction).
 * The display service uses this to:
 * - Determine if disposable income section should show (if any transactions exist)
 * - Calculate and display the balance (tagged transactions - transfers OUT)
 *
 * Graceful degradation: If disposableIncomeAccounts is not configured (empty array),
 * uses tag-based filtering only.
 */
export class DisposableIncomeService extends BaseTransactionAnalysisService<TransactionSplit[]> {
    constructor(
        transactionService: ITransactionService,
        transactionClassificationService: ITransactionClassificationService,
        private readonly disposableIncomeAccounts: string[],
        private readonly validDestinationAccounts: string[],
        logger?: ILogger
    ) {
        super(transactionService, transactionClassificationService, logger);
    }

    /**
     * Identifies disposable income transactions for a given month.
     * Returns Result type for explicit error handling.
     *
     * @param month - The month to calculate for (1-12)
     * @param year - The year to calculate for
     * @returns Result containing array of disposable income transactions or error
     */
    async calculateDisposableIncome(month: number, year: number) {
        return this.executeAnalysis(month, year);
    }

    /**
     * Calculates the disposable income balance after transfer deductions.
     *
     * This method:
     * 1. Gets all transactions for the month
     * 2. Identifies disposable income tagged transactions
     * 3. Deducts transfers OUT of disposable income accounts to valid destinations
     * 4. Returns the net balance (minimum 0)
     *
     * @param month - The month to calculate for (1-12)
     * @param year - The year to calculate for
     * @returns The net disposable income balance (tagged - transfers, minimum 0)
     */
    async calculateDisposableIncomeBalance(month: number, year: number): Promise<number> {
        // Get all transactions for the month
        const transactions = await this.transactionService.getTransactionsForMonth(month, year);

        // Calculate tag-based total
        const disposableIncomeTransactions = this.findDisposableIncome(transactions);
        const tagBasedTotal = this.calculateTotal(disposableIncomeTransactions);

        // Calculate transfer deductions
        const transferDeduction = this.calculateTransferDeduction(transactions);

        // Final total (tag-based minus transfers, minimum 0)
        const finalTotal = Math.max(0, tagBasedTotal - transferDeduction);

        this.logger.debug(
            {
                month,
                year,
                tagBasedTotal,
                transferDeduction,
                finalTotal,
            },
            'Calculated disposable income balance with transfer deductions'
        );

        return finalTotal;
    }

    /**
     * Gets the transfers that reduce disposable income balance.
     *
     * Returns transfers OUT of disposable income accounts INTO validDestinationAccounts.
     *
     * @param month - The month to calculate for (1-12)
     * @param year - The year to calculate for
     * @returns Array of transfers that reduce disposable income balance
     */
    async getDisposableIncomeTransfers(month: number, year: number): Promise<TransactionSplit[]> {
        // Get all transactions for the month
        const transactions = await this.transactionService.getTransactionsForMonth(month, year);

        return this.getQualifyingTransfers(transactions);
    }

    /**
     * Gets transfers that qualify for deduction from disposable income.
     *
     * Returns transfers OUT of disposable income accounts INTO validDestinationAccounts.
     */
    private getQualifyingTransfers(transactions: TransactionSplit[]): TransactionSplit[] {
        // Graceful degradation: if not configured, return empty
        if (!this.disposableIncomeAccounts || this.disposableIncomeAccounts.length === 0) {
            return [];
        }

        return transactions.filter(transaction => {
            // Must be a transfer
            if (!this.transactionClassificationService.isTransfer(transaction)) {
                return false;
            }

            // Must have source and destination
            if (!transaction.source_id || !transaction.destination_id) {
                return false;
            }

            // Source must be in disposableIncomeAccounts
            const isFromDisposableAccount = this.disposableIncomeAccounts.includes(
                transaction.source_id
            );

            // Destination must be in validDestinationAccounts
            const isToValidDestination = this.validDestinationAccounts.includes(
                transaction.destination_id
            );

            return isFromDisposableAccount && isToValidDestination;
        });
    }

    /**
     * Analyzes transactions to identify disposable income transactions.
     * Returns the filtered list of disposable income tagged transactions.
     * The balance (after transfer deductions) is calculated by the caller.
     */
    protected async analyzeTransactions(
        transactions: TransactionSplit[],
        month: number,
        year: number
    ): Promise<TransactionSplit[]> {
        const disposableIncomeTransactions = this.findDisposableIncome(transactions);

        this.logger.debug(
            {
                month,
                year,
                transactionCount: disposableIncomeTransactions.length,
            },
            'Identified disposable income transactions'
        );

        return disposableIncomeTransactions;
    }

    protected getOperationName(): string {
        return 'calculateDisposableIncome';
    }

    /**
     * Finds all disposable income transactions in the given list.
     *
     * @param transactions - All transactions to search
     * @returns Array of disposable income transactions
     */
    private findDisposableIncome(transactions: TransactionSplit[]): TransactionSplit[] {
        return transactions.filter(t =>
            this.transactionClassificationService.isDisposableIncome(t)
        );
    }

    /**
     * Calculates total amount from disposable income transactions.
     * Uses absolute values since these are expenses (negative amounts).
     */
    private calculateTotal(transactions: TransactionSplit[]): number {
        return TransactionCalculationUtils.calculateTransactionTotal(
            transactions,
            true,
            this.logger
        );
    }

    /**
     * Calculates the total amount to deduct from disposable income due to transfers.
     *
     * Only transfers meeting ALL criteria are included:
     * 1. Transaction is a transfer (type === "transfer")
     * 2. Source account is in disposableIncomeAccounts
     * 3. Destination account is in validDestinationAccounts
     *
     * If disposableIncomeAccounts is not configured (empty), returns 0.
     *
     * @param transactions - All transactions for the month
     * @returns Total amount to deduct (always positive)
     */
    private calculateTransferDeduction(transactions: TransactionSplit[]): number {
        // Graceful degradation: if not configured, return 0
        if (!this.disposableIncomeAccounts || this.disposableIncomeAccounts.length === 0) {
            this.logger.debug(
                'disposableIncomeAccounts not configured, skipping transfer deduction'
            );
            return 0;
        }

        // Find qualifying transfers using shared method
        const qualifyingTransfers = this.getQualifyingTransfers(transactions);

        // Calculate total (transfers OUT have positive amounts in Firefly)
        const total = TransactionCalculationUtils.calculateTransactionTotal(
            qualifyingTransfers,
            false, // Don't use absolute values - transfers are already positive
            this.logger
        );

        this.logger.debug(
            {
                qualifyingTransferCount: qualifyingTransfers.length,
                transferDeduction: total,
            },
            'Calculated transfer deduction for disposable income'
        );

        return total;
    }
}
