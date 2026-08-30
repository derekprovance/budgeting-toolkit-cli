import { ITransactionService } from './core/transaction.service.interface.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { BaseTransactionAnalysisService } from './core/base-transaction-analysis.service.js';
import { AccountScopeService } from './core/account-scope.service.js';
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
        private readonly accountScope: AccountScopeService,
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
        // Resolved here rather than injected: the scope is derived from Firefly
        // and the factory that builds this service is synchronous.
        const validExpenseAccounts = await this.accountScope.getExpenseSources();
        this.warnOnUnreachableTransfers(validExpenseAccounts);
        const expenses = this.filterExpenses(transactions, validExpenseAccounts);

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
    private filterExpenses(transactions: TransactionSplit[], validExpenseAccounts: string[]) {
        return transactions.filter(trx => {
            const isTransfer = this.transactionClassificationService.isTransfer(trx);

            return isTransfer
                ? this.isRegularExpenseTransaction(trx, validExpenseAccounts) &&
                      this.shouldCountTransfer(trx)
                : this.isRegularExpenseTransaction(trx, validExpenseAccounts);
        });
    }

    /**
     * Warns about configured transfers that can never match.
     *
     * A transfer must clear `isRegularExpenseTransaction` before
     * `shouldCountTransfer` is ever consulted, so its SOURCE has to be a derived
     * expense source. `AccountScopeService` subtracts `untrackedAccounts` from
     * that list, which means an `expenseTransfers` entry pointing out of an
     * untracked account is silently inert — the two settings look like they
     * cooperate and instead cancel out.
     */
    private warnOnUnreachableTransfers(validExpenseAccounts: string[]): void {
        const unreachable = this.validTransfers.filter(
            transfer => !validExpenseAccounts.includes(transfer.source)
        );

        if (unreachable.length > 0) {
            this.logger.warn(
                { transfers: unreachable, validExpenseAccounts },
                'Configured expenseTransfers whose source is not a tracked expense source ' +
                    'will never match - check whether the source account is in untrackedAccounts'
            );
        }
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
     * Checks if a transaction is a regular unbudgeted expense.
     *
     * 1. Must have no budget assigned
     * 2. Must not be a bill (linked via bill_id or subscription_id)
     * 3. Must not be supplemented by disposable income
     * 4. Must not be in excluded transactions list
     * 5. Must be from a valid expense account
     */
    private isRegularExpenseTransaction(
        transaction: TransactionSplit,
        validExpenseAccounts: string[]
    ): boolean {
        const conditions = {
            hasNoBudget: !transaction.budget_id,
            isNotBill: !this.transactionClassificationService.isBill(transaction),
            isNotDisposableSupplemented:
                !this.transactionClassificationService.isSupplementedByDisposable(transaction.tags),
            isFromExpenseAccount: this.isExpenseAccount(
                transaction.source_id,
                validExpenseAccounts
            ),
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
            conditions.isFromExpenseAccount
        );
    }

    /**
     * Checks if an account is a valid expense source account.
     *
     * Uses configuration from YAML file (expenseSourceAccounts) with fallback to defaults.
     */
    private isExpenseAccount(accountId: string | null, validExpenseAccounts: string[]): boolean {
        if (!accountId) {
            return false;
        }

        return validExpenseAccounts.includes(accountId);
    }
}
