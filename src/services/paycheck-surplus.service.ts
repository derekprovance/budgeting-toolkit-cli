import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { BaseTransactionAnalysisService } from './core/base-transaction-analysis.service.js';
import { ILogger } from '../types/interface/logger.interface.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';

/**
 * Service for calculating paycheck surplus (difference between actual and expected paychecks).
 *
 * Extends BaseTransactionAnalysisService for consistent error handling and Result types.
 */
export class PaycheckSurplusService extends BaseTransactionAnalysisService<number> {
    constructor(
        transactionService: ITransactionService,
        transactionClassificationService: ITransactionClassificationService,
        private readonly expectedMonthlyPaycheck: number | undefined,
        logger?: ILogger
    ) {
        super(transactionService, transactionClassificationService, logger);
    }

    /**
     * Calculates the difference between actual and expected paycheck amounts for a given month.
     * Returns Result type for explicit error handling.
     *
     * @param month - The month to calculate for (1-12)
     * @param year - The year to calculate for
     * @returns Result containing surplus amount or error
     */
    async calculatePaycheckSurplus(month: number, year: number) {
        return this.executeAnalysis(month, year);
    }

    /**
     * Analyzes transactions to calculate paycheck surplus.
     * Implements domain-specific logic for identifying and summing paychecks.
     */
    protected async analyzeTransactions(
        transactions: TransactionSplit[],
        month: number,
        year: number
    ): Promise<number> {
        const paycheckCandidates = this.findPaychecks(transactions);
        const expectedPaycheckAmount = this.getExpectedPaycheckAmount();
        const totalPaycheckAmount = this.calculateTotalPaycheckAmount(paycheckCandidates);

        const surplus = totalPaycheckAmount - expectedPaycheckAmount;

        this.logger.debug(
            {
                month,
                year,
                expectedPaycheckAmount,
                totalPaycheckAmount,
                surplus,
                paycheckCount: paycheckCandidates.length,
            },
            'Calculated paycheck surplus'
        );

        return surplus;
    }

    protected getOperationName(): string {
        return 'calculatePaycheckSurplus';
    }

    /**
     * Gets the expected monthly paycheck amount from configuration.
     *
     * @returns Expected paycheck amount, or 0 if not configured
     */
    private getExpectedPaycheckAmount(): number {
        if (this.expectedMonthlyPaycheck === undefined) {
            this.logger.warn('Expected monthly paycheck amount not configured');
            return 0;
        }

        return this.expectedMonthlyPaycheck;
    }

    /**
     * Calculates total paycheck amount from a list of paycheck transactions.
     */
    private calculateTotalPaycheckAmount(paychecks: TransactionSplit[]): number {
        return TransactionCalculationUtils.calculateTransactionTotal(paychecks, false, this.logger);
    }

    /**
     * Finds all paycheck transactions in the given list.
     *
     * Uses tag-based identification - any transaction tagged with the configured
     * paycheck tag (default: "Paycheck") is considered a paycheck.
     *
     * Works with all transaction types (deposits, transfers, etc).
     *
     * @param transactions - All transactions to search
     * @returns Array of paycheck transactions, sorted by amount descending
     */
    private findPaychecks(transactions: TransactionSplit[]): TransactionSplit[] {
        const paychecks = transactions
            .filter(t => {
                const isPaycheck = this.transactionClassificationService.isPaycheck(t);
                if (isPaycheck) {
                    this.logger.debug(
                        {
                            transaction_id: t.transaction_journal_id,
                            type: t.type,
                            description: t.description,
                            amount: t.amount,
                            tags: t.tags,
                        },
                        'Identified paycheck transaction via tag'
                    );
                }
                return isPaycheck;
            })
            .sort((a, b) => {
                const amountA = parseFloat(a.amount);
                const amountB = parseFloat(b.amount);
                return amountB - amountA;
            });

        this.logger.debug(
            {
                totalTransactions: transactions.length,
                paychecksFound: paychecks.length,
            },
            'Paycheck search completed'
        );

        return paychecks;
    }
}
