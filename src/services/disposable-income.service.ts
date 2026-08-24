import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { BaseTransactionAnalysisService } from './core/base-transaction-analysis.service.js';
import { ILogger } from '../types/interface/logger.interface.js';
import { TransactionCalculationUtils } from '../utils/transaction-calculation.utils.js';

/**
 * Disposable income analysis for a month, produced from a single transaction
 * fetch.
 */
export interface DisposableIncomeAnalysis {
    /** Transactions tagged as disposable income */
    transactions: TransactionSplit[];
    /** Net tagged spending: withdrawals less any refunds */
    balance: number;
    /**
     * The transactions counted above that ALSO carry a budget, and are
     * therefore inside Firefly's server-side budget total as well. The analyze
     * report uses these to avoid subtracting the same spending twice.
     */
    budgetedTransactions: TransactionSplit[];
}

/**
 * Service for calculating disposable income spending.
 *
 * Extends BaseTransactionAnalysisService for consistent error handling and
 * Result types.
 *
 * The disposable-income tag marks purchases made on ordinary spending accounts
 * that are mentally charged to a separate pool. **The tagged purchase is the
 * expense** — that is the moment real money left a real account.
 *
 * Movements of the pool itself are deliberately not modelled here. Funding it
 * and drawing from it to settle a tagged purchase are both internal transfers
 * between accounts the owner already holds, so neither is income nor spending.
 * An earlier version deducted those draws from the tagged total, which drove
 * the total to zero on exactly the months the workflow was followed — and since
 * tagged transactions carry no budget, that spending was then charged to no
 * bucket at all.
 */
export class DisposableIncomeService extends BaseTransactionAnalysisService<DisposableIncomeAnalysis> {
    constructor(
        transactionService: ITransactionService,
        transactionClassificationService: ITransactionClassificationService,
        logger?: ILogger
    ) {
        super(transactionService, transactionClassificationService, logger);
    }

    /**
     * Produces the disposable income analysis for a month.
     *
     * @param month - The month to calculate for (1-12)
     * @param year - The year to calculate for
     * @returns Result containing the disposable income analysis or error
     */
    async calculateDisposableIncome(month: number, year: number) {
        return this.executeAnalysis(month, year);
    }

    protected analyzeTransactions(
        transactions: TransactionSplit[],
        month: number,
        year: number
    ): DisposableIncomeAnalysis {
        const disposableIncomeTransactions = this.findDisposableIncome(transactions);
        const balance = this.calculateTotal(disposableIncomeTransactions);

        // Of the spending counted above, the part Firefly's budget total also
        // counts, so the report can correct for the overlap.
        const budgetedTransactions = disposableIncomeTransactions.filter(t =>
            this.transactionClassificationService.hasBudget(t)
        );

        this.logger.debug(
            {
                month,
                year,
                transactionCount: disposableIncomeTransactions.length,
                balance,
                budgetedCount: budgetedTransactions.length,
            },
            'Calculated disposable income analysis'
        );

        return {
            transactions: disposableIncomeTransactions,
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
     * Transfers are excluded because a tagged transfer is pool movement, not a
     * purchase.
     *
     * @param transactions - All transactions to search
     * @returns Array of disposable income transactions
     */
    private findDisposableIncome(transactions: TransactionSplit[]): TransactionSplit[] {
        return transactions.filter(
            t =>
                this.transactionClassificationService.isDisposableIncome(t) &&
                !this.transactionClassificationService.isBill(t) &&
                !this.transactionClassificationService.isTransfer(t)
        );
    }

    /**
     * Calculates total spending from disposable income transactions.
     *
     * Direction comes from the transaction type: a deposit or refund tagged as
     * disposable income reduces the total rather than inflating it.
     */
    private calculateTotal(transactions: TransactionSplit[]): number {
        return TransactionCalculationUtils.calculateNetSpend(transactions, this.logger);
    }
}
