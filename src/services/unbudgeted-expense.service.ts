import { TransactionService } from './core/transaction.service';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { TransactionClassificationService } from './core/transaction-classification.service';
import { logger } from '../logger';
import { DateUtils } from '../utils/date.utils';
import { getConfigValue } from '../utils/config-loader';
import { ValidTransfer } from '../types/interface/valid-transfer.interface';

/**
 * Service for calculating unbudgeted expenses.
 *
 * 1. A transaction is considered an unbudgeted expense if:
 *    - It is a bill (has the "Bills" tag), OR
 *    - It meets all regular expense criteria:
 *      - Has no budget assigned
 *      - Not supplemented by disposable income
 *      - Not in excluded transactions list
 *      - From a valid expense account
 *
 * 2. Valid expense accounts defined in yaml config
 *
 * 3. Transfers are ignored unless specified in yaml config
 */
export class UnbudgetedExpenseService {
    private readonly validExpenseAccounts: string[];
    private readonly validTransfers: ValidTransfer[];

    constructor(
        private readonly transactionService: TransactionService,
        private readonly transactionClassificationService: TransactionClassificationService
    ) {
        // Load valid expense accounts from YAML config with fallback to defaults
        this.validExpenseAccounts = getConfigValue<string[]>('validExpenseAccounts') ?? [];
        this.validTransfers = getConfigValue<ValidTransfer[]>('validTransfers') ?? [];
    }

    /**
     * Calculates unbudgeted expenses for a given month and year.
     *
     * 1. Get all transactions for the month
     * 2. Filter transactions based on criteria:
     *    - Bills are always included
     *    - Regular expenses must meet all criteria
     *    - Transfers must meet special criteria
     */
    async calculateUnbudgetedExpenses(month: number, year: number): Promise<TransactionSplit[]> {
        try {
            DateUtils.validateMonthYear(month, year);
            const transactions = await this.transactionService.getTransactionsForMonth(month, year);
            const expenses = await this.filterExpenses(transactions);

            logger.debug(
                {
                    month,
                    year,
                    totalTransactions: transactions.length,
                    unbudgetedExpenses: expenses.length,
                },
                'Calculated unbudgeted expenses'
            );

            return expenses;
        } catch (error) {
            logger.error(
                {
                    month,
                    year,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
                'Failed to calculate unbudgeted expenses'
            );
            if (error instanceof Error) {
                throw new Error(
                    `Failed to calculate unbudgeted expenses for month ${month}: ${error.message}`
                );
            }
            throw new Error(`Failed to calculate unbudgeted expenses for month ${month}`);
        }
    }

    /**
     * Filters transactions to find unbudgeted expenses.
     *
     * 1. For each transaction:
     *    - If it's a bill, include it
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
     *
     * 1. If it's a bill, always count it
     * 2. Otherwise, check regular expense criteria
     */
    private async shouldCountExpense(transaction: TransactionSplit): Promise<boolean> {
        if (this.transactionClassificationService.isBill(transaction)) {
            return true;
        }
        return this.isRegularExpenseTransaction(transaction);
    }

    /**
     * Checks if a transaction is a regular unbudgeted expense.
     *
     * 1. Must have no budget assigned
     * 2. Must not be supplemented by disposable income
     * 3. Must not be in excluded transactions list
     * 4. Must be from a valid expense account
     */
    private async isRegularExpenseTransaction(transaction: TransactionSplit): Promise<boolean> {
        const isExcludedTransaction = await this.transactionClassificationService.isExcludedTransaction(
            transaction.description,
            transaction.amount
        );

        const conditions = {
            hasNoBudget: !transaction.budget_id,
            isNotDisposableSupplemented:
                !this.transactionClassificationService.isSupplementedByDisposable(transaction.tags),
            isNotExcludedTransaction: !isExcludedTransaction,
            isFromExpenseAccount: this.isExpenseAccount(transaction.source_id),
        };

        logger.debug(
            {
                transactionId: transaction.transaction_journal_id,
                description: transaction.description,
                conditions,
            },
            'Evaluating regular expense transaction'
        );

        return (
            conditions.hasNoBudget &&
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
