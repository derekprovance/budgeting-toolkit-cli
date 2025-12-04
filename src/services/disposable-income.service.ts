import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { BaseTransactionAnalysisService } from './core/base-transaction-analysis.service.js';
import { ILogger } from '../types/interface/logger.interface.js';

/**
 * Service for calculating disposable income total.
 *
 * Extends BaseTransactionAnalysisService for consistent error handling and Result types.
 *
 * Calculates the total amount of transactions tagged with "Disposable Income".
 * These are expenses intentionally supplemented by disposable income.
 */
export class DisposableIncomeService extends BaseTransactionAnalysisService<number> {
    constructor(
        transactionService: ITransactionService,
        transactionClassificationService: ITransactionClassificationService,
        logger?: ILogger
    ) {
        super(transactionService, transactionClassificationService, logger);
    }

    /**
     * Calculates the total disposable income spent for a given month.
     * Returns Result type for explicit error handling.
     *
     * @param month - The month to calculate for (1-12)
     * @param year - The year to calculate for
     * @returns Result containing total disposable income amount or error
     */
    async calculateDisposableIncome(month: number, year: number) {
        return this.executeAnalysis(month, year);
    }

    /**
     * Analyzes transactions to calculate disposable income total.
     * Implements domain-specific logic for identifying and summing disposable income transactions.
     */
    protected async analyzeTransactions(
        transactions: TransactionSplit[],
        month: number,
        year: number
    ): Promise<number> {
        const disposableIncomeTransactions = this.findDisposableIncome(transactions);
        const total = this.calculateTotal(disposableIncomeTransactions);

        this.logger.debug(
            {
                month,
                year,
                total,
                transactionCount: disposableIncomeTransactions.length,
            },
            'Calculated disposable income total'
        );

        return total;
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
     *
     * @param transactions - Array of disposable income transactions
     * @returns Sum of absolute values of all amounts
     */
    private calculateTotal(transactions: TransactionSplit[]): number {
        return transactions.reduce((sum, transaction) => {
            const amount = parseFloat(transaction.amount);
            if (isNaN(amount)) {
                this.logger.warn({ transaction }, 'Invalid disposable income amount found');
                return sum;
            }
            return sum + Math.abs(amount);
        }, 0);
    }
}
