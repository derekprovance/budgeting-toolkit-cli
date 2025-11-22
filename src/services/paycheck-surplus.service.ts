import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import { ITransactionClassificationService } from './core/transaction-classification.service.interface.js';
import { logger as defaultLogger } from '../logger.js';
import { DateUtils } from '../utils/date.utils.js';
import { expectedMonthlyPaycheck as defaultExpectedPaycheck } from '../config.js';
import { ILogger } from '../types/interface/logger.interface.js';

/**
 * Service for calculating paycheck surplus (difference between actual and expected paychecks).
 */
export class PaycheckSurplusService {
    private readonly expectedMonthlyPaycheck: number | string | undefined | null;
    private readonly logger: ILogger;

    constructor(
        private readonly transactionService: ITransactionService,
        private readonly transactionClassificationService: ITransactionClassificationService,
        expectedMonthlyPaycheck?: number | string | null,
        logger: ILogger = defaultLogger
    ) {
        // Explicitly handle null to allow testing missing config scenario
        if (expectedMonthlyPaycheck === null) {
            this.expectedMonthlyPaycheck = null;
        } else {
            this.expectedMonthlyPaycheck = expectedMonthlyPaycheck ?? defaultExpectedPaycheck;
        }
        this.logger = logger;
    }

    /**
     * Calculates the difference between actual and expected paycheck amounts for a given month.
     *
     * @param month - The month to calculate for (1-12)
     * @param year - The year to calculate for
     * @returns The difference between actual and expected paycheck amounts
     * @throws Error if month/year is invalid or if paycheck amounts cannot be calculated
     */
    async calculatePaycheckSurplus(month: number, year: number): Promise<number> {
        try {
            const paycheckCandidates = await this.findPaychecks(month, year);
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
        } catch (error) {
            this.logger.error(
                {
                    month,
                    year,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    type: error instanceof Error ? error.constructor.name : typeof error,
                },
                'Failed to calculate paycheck surplus'
            );
            throw error;
        }
    }

    private getExpectedPaycheckAmount(): number {
        if (this.expectedMonthlyPaycheck === undefined || this.expectedMonthlyPaycheck === null) {
            this.logger.warn(
                {
                    expectedMonthlyPaycheck: this.expectedMonthlyPaycheck,
                },
                'Expected monthly paycheck amount not configured'
            );
            return 0;
        }

        const amount =
            typeof this.expectedMonthlyPaycheck === 'number'
                ? this.expectedMonthlyPaycheck
                : parseFloat(this.expectedMonthlyPaycheck);

        if (isNaN(amount)) {
            this.logger.error(
                {
                    expectedMonthlyPaycheck: this.expectedMonthlyPaycheck,
                },
                'Invalid expected monthly paycheck amount'
            );
            return 0;
        }

        return amount;
    }

    private calculateTotalPaycheckAmount(paychecks: TransactionSplit[]): number {
        return paychecks.reduce((sum, paycheck) => {
            const amount = parseFloat(paycheck.amount);
            if (isNaN(amount)) {
                this.logger.warn({ paycheck }, 'Invalid paycheck amount found');
                return sum;
            }
            return sum + amount;
        }, 0);
    }

    private async findPaychecks(month: number, year: number): Promise<TransactionSplit[]> {
        try {
            DateUtils.validateMonthYear(month, year);
            const transactions = await this.transactionService.getTransactionsForMonth(month, year);

            const paycheckCandidates = transactions
                .filter(t => this.transactionClassificationService.isDeposit(t))
                .filter(t => this.isPaycheck(t))
                .sort((a, b) => {
                    const amountA = parseFloat(a.amount);
                    const amountB = parseFloat(b.amount);
                    return amountB - amountA;
                });

            this.logger.debug(
                {
                    month,
                    year,
                    totalTransactions: transactions.length,
                    paycheckCandidates: paycheckCandidates.length,
                },
                'Found paycheck candidates'
            );

            return paycheckCandidates;
        } catch (error) {
            this.logger.error(
                {
                    month,
                    year,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    type: error instanceof Error ? error.constructor.name : typeof error,
                },
                'Failed to find paychecks'
            );
            if (error instanceof Error) {
                throw new Error(`Failed to find paychecks for month ${month}: ${error.message}`);
            }
            throw new Error(`Failed to find paychecks for month ${month}`);
        }
    }

    private isPaycheck(transaction: TransactionSplit): boolean {
        const hasPayrollDescription =
            transaction.description?.toLowerCase().includes('payroll') || false;

        const hasPaycheckCategory =
            transaction.category_name === 'Paycheck' &&
            transaction.source_type === 'Revenue account';

        return hasPayrollDescription || hasPaycheckCategory;
    }
}
