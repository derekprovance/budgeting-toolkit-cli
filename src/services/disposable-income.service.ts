import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { BaseTransactionAnalysisService } from './core/base-transaction-analysis.service.js';
import { ILogger } from '../types/interface/logger.interface.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';

/**
 * Complete disposable income analysis for a month, produced from a single
 * transaction fetch.
 */
export interface DisposableIncomeAnalysis {
    /** Transactions tagged as disposable income */
    transactions: TransactionSplit[];
    /** Transfers OUT of disposable income accounts that reduce the balance */
    transfers: TransactionSplit[];
    /** Net balance: tagged spending minus transfer deductions (minimum 0) */
    balance: number;
}

/**
 * Service for calculating disposable income.
 *
 * Extends BaseTransactionAnalysisService for consistent error handling and Result types.
 *
 * Identifies transactions tagged with "Disposable Income" and deducts transfers
 * OUT of disposable income accounts to valid destinations, returning the tagged
 * transactions, the qualifying transfers, and the net balance together.
 *
 * Graceful degradation: If disposableIncomeAccounts is not configured (empty array),
 * uses tag-based filtering only.
 */
export class DisposableIncomeService extends BaseTransactionAnalysisService<DisposableIncomeAnalysis> {
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
     * Produces the complete disposable income analysis for a month from one
     * transaction fetch: tagged transactions, qualifying transfers, and the
     * net balance. Returns Result type for explicit error handling.
     *
     * @param month - The month to calculate for (1-12)
     * @param year - The year to calculate for
     * @returns Result containing the disposable income analysis or error
     */
    async calculateDisposableIncome(month: number, year: number) {
        return this.executeAnalysis(month, year);
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
     * Analyzes transactions to build the complete disposable income picture:
     * tagged transactions, qualifying transfers, and the net balance.
     */
    protected analyzeTransactions(
        transactions: TransactionSplit[],
        month: number,
        year: number
    ): DisposableIncomeAnalysis {
        const disposableIncomeTransactions = this.findDisposableIncome(transactions);
        const transfers = this.getQualifyingTransfers(transactions);

        const tagBasedTotal = this.calculateTotal(disposableIncomeTransactions);
        const transferDeduction = this.calculateTransferDeduction(transfers);
        const balance = Math.max(0, tagBasedTotal - transferDeduction);

        this.logger.debug(
            {
                month,
                year,
                transactionCount: disposableIncomeTransactions.length,
                transferCount: transfers.length,
                tagBasedTotal,
                transferDeduction,
                balance,
            },
            'Calculated disposable income analysis'
        );

        return { transactions: disposableIncomeTransactions, transfers, balance };
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
     * Calculates total spending from disposable income transactions.
     * Only withdrawals count as spending — a deposit or refund tagged as
     * disposable income must not inflate the total via absolute-value summing.
     */
    private calculateTotal(transactions: TransactionSplit[]): number {
        const withdrawals = transactions.filter(t => t.type === 'withdrawal');
        return TransactionCalculationUtils.calculateTransactionTotal(
            withdrawals,
            true,
            this.logger
        );
    }

    /**
     * Calculates the total amount to deduct from disposable income for the
     * given qualifying transfers (transfers OUT have positive amounts in Firefly).
     */
    private calculateTransferDeduction(qualifyingTransfers: TransactionSplit[]): number {
        return TransactionCalculationUtils.calculateTransactionTotal(
            qualifyingTransfers,
            false, // Don't use absolute values - transfers are already positive
            this.logger
        );
    }
}
