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
    /**
     * Tagged spending on the same basis {@link balance} is built from: net of
     * refunds, transfers excluded. Reported rather than left to the caller so
     * a display can print `tagged - transfers = balance` without re-deriving
     * the first term on a different basis and printing a sum that does not add
     * up.
     */
    taggedTotal: number;
    /** Net balance: tagged spending minus transfer deductions (minimum 0) */
    balance: number;
    /**
     * The transactions counted above that ALSO carry a budget, and are
     * therefore inside Firefly's server-side budget total as well. The analyze
     * report uses these to avoid subtracting the same spending twice.
     */
    budgetedTransactions: TransactionSplit[];
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

        // Of the spending counted above, the part Firefly's budget total also
        // counts. Same basis as calculateTotal — transfers excluded — so the
        // report's correction matches what was actually charged.
        const budgetedTransactions = this.excludeTransfers(disposableIncomeTransactions).filter(t =>
            this.transactionClassificationService.hasBudget(t)
        );
        const budgetedTotal = TransactionCalculationUtils.calculateNetSpend(
            budgetedTransactions,
            this.logger
        );

        this.logger.debug(
            {
                month,
                year,
                transactionCount: disposableIncomeTransactions.length,
                transferCount: transfers.length,
                tagBasedTotal,
                transferDeduction,
                balance,
                budgetedTotal,
            },
            'Calculated disposable income analysis'
        );

        return {
            transactions: disposableIncomeTransactions,
            transfers,
            taggedTotal: tagBasedTotal,
            balance,
            budgetedTransactions,
        };
    }

    protected getOperationName(): string {
        return 'calculateDisposableIncome';
    }

    /**
     * Finds all disposable income transactions in the given list.
     *
     * Bill-linked transactions are excluded: BillComparisonService already
     * counts those, and the analyze report must charge each transaction once.
     *
     * @param transactions - All transactions to search
     * @returns Array of disposable income transactions
     */
    private findDisposableIncome(transactions: TransactionSplit[]): TransactionSplit[] {
        return transactions.filter(
            t =>
                this.transactionClassificationService.isDisposableIncome(t) &&
                !this.transactionClassificationService.isBill(t)
        );
    }

    /**
     * Calculates total spending from disposable income transactions.
     *
     * Direction comes from the transaction type: a deposit or refund tagged as
     * disposable income reduces the total rather than inflating it.
     *
     * Transfers are excluded on purpose. Movement in and out of a disposable
     * account is already accounted for by {@link calculateTransferDeduction};
     * counting a tagged transfer here as well would add it (+X) and deduct it
     * (-X) in the same breath, silently cancelling the deduction.
     */
    private calculateTotal(transactions: TransactionSplit[]): number {
        return TransactionCalculationUtils.calculateNetSpend(
            this.excludeTransfers(transactions),
            this.logger
        );
    }

    private excludeTransfers(transactions: TransactionSplit[]): TransactionSplit[] {
        return transactions.filter(t => !this.transactionClassificationService.isTransfer(t));
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
