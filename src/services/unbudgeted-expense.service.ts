import { ITransactionService } from './core/transaction.service.interface.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { BaseTransactionAnalysisService } from './core/base-transaction-analysis.service.js';
import { ValidTransfer } from '../types/common.types.js';

/**
 * Service for calculating unbudgeted expenses.
 *
 * Extends BaseTransactionAnalysisService for consistent error handling and Result types.
 *
 * A transaction is considered an unbudgeted expense if it meets all criteria:
 * - Has no budget assigned
 * - Not supplemented by disposable income
 * - Not in excluded transactions list
 * - From a valid expense account
 *
 * Note: Bills are NOT included here - they are handled separately by BillComparisonService
 * Valid expense accounts defined in configuration
 * Transfers are ignored unless specified in configuration
 */
export class UnbudgetedExpenseService extends BaseTransactionAnalysisService<TransactionSplit[]> {
    constructor(
        transactionService: ITransactionService,
        transactionClassificationService: ITransactionClassificationService,
        private readonly validExpenseAccounts: string[],
        private readonly validTransfers: ValidTransfer[]
    ) {
        super(transactionService, transactionClassificationService);
    }

    /**
     * Calculates unbudgeted expenses for a given month and year.
     * Returns Result type for explicit error handling.
     *
     * @param month - Month to calculate (1-12)
     * @param year - Year to calculate
     * @returns Result containing array of unbudgeted expense transactions or error
     */
    async calculateUnbudgetedExpenses(month: number, year: number) {
        return this.executeAnalysis(month, year);
    }

    /**
     * Analyzes transactions to identify unbudgeted expenses.
     * Implements domain-specific filtering logic.
     */
    protected async analyzeTransactions(
        transactions: TransactionSplit[]
    ): Promise<TransactionSplit[]> {
        const expenses = await this.filterExpenses(transactions);

        this.logger.debug(
            {
                totalTransactions: transactions.length,
                unbudgetedExpenses: expenses.length,
            },
            'Calculated unbudgeted expenses'
        );

        return expenses;
    }

    protected getOperationName(): string {
        return 'calculateUnbudgetedExpenses';
    }

    /**
     * Filters transactions to find unbudgeted expenses.
     *
     * 1. For each transaction:
     *    - If it's a transfer, check transfer criteria
     *    - Otherwise, check regular expense criteria
     */
    private async filterExpenses(transactions: TransactionSplit[]) {
        const results = await Promise.all(
            transactions.map(async transaction => {
                const isTransfer = this.transactionClassificationService.isTransfer(transaction);
                const shouldCountExpense = await this.shouldCountExpense(transaction);

                return (
                    (!isTransfer && shouldCountExpense) ||
                    (shouldCountExpense && this.shouldCountTransfer(transaction))
                );
            })
        );

        return transactions.filter((_, index) => results[index]);
    }

    /**
     * Checks if a transfer should be counted as an unbudgeted expense.
     *
     * 1. If no destination account, count it
     * 2. Otherwise, must be an object defined in yaml configuration
     */
    private shouldCountTransfer(transaction: TransactionSplit): boolean {
        if (!transaction.destination_id) {
            return true;
        }

        return this.validTransfers.some(
            transfer =>
                transaction.source_id === transfer.source &&
                transaction.destination_id === transfer.destination
        );
    }

    /**
     * Checks if a transaction should be counted as an expense.
     * Checks regular expense criteria (bills are handled separately by BillComparisonService).
     */
    private async shouldCountExpense(transaction: TransactionSplit): Promise<boolean> {
        return this.isRegularExpenseTransaction(transaction);
    }

    /**
     * Checks if a transaction is a regular unbudgeted expense.
     *
     * 1. Must have no budget assigned
     * 2. Must not be tagged as a bill
     * 3. Must not be supplemented by disposable income
     * 4. Must not be in excluded transactions list
     * 5. Must be from a valid expense account
     */
    private async isRegularExpenseTransaction(transaction: TransactionSplit): Promise<boolean> {
        const isExcludedTransaction =
            await this.transactionClassificationService.isExcludedTransaction(
                transaction.description,
                transaction.amount
            );

        const conditions = {
            hasNoBudget: !transaction.budget_id,
            isNotBill: !this.transactionClassificationService.isBill(transaction),
            isNotDisposableSupplemented:
                !this.transactionClassificationService.isSupplementedByDisposable(transaction.tags),
            isNotExcludedTransaction: !isExcludedTransaction,
            isFromExpenseAccount: this.isExpenseAccount(transaction.source_id),
        };

        this.logger.debug(
            {
                transactionId: transaction.transaction_journal_id,
                description: transaction.description,
                conditions,
            },
            'Evaluating regular expense transaction'
        );

        return (
            conditions.hasNoBudget &&
            conditions.isNotBill &&
            conditions.isNotDisposableSupplemented &&
            conditions.isNotExcludedTransaction &&
            conditions.isFromExpenseAccount
        );
    }

    /**
     * Checks if an account is a valid expense account.
     *
     * Uses configuration from YAML file (validExpenseAccounts) with fallback to defaults.
     */
    private isExpenseAccount(accountId: string | null): boolean {
        if (!accountId) {
            return false;
        }

        return this.validExpenseAccounts.includes(accountId);
    }
}
