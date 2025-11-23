import { Command } from '../types/interface/command.interface.js';
import { BudgetDateParams } from '../types/interface/budget-date-params.interface.js';
import { AdditionalIncomeService } from '../services/additional-income.service.js';
import { UnbudgetedExpenseService } from '../services/unbudgeted-expense.service.js';
import { TransactionClassificationService } from '../services/core/transaction-classification.service.js';
import { FinalizeBudgetDisplayService } from '../services/display/finalize-budget-display.service.js';
import { PaycheckSurplusService } from '../services/paycheck-surplus.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { TransactionCounts } from '../services/display/finalize-budget-display.service.js';
import chalk from 'chalk';

/**
 * Command for finalizing budget and displaying the finalization report
 */

export class FinalizeBudgetCommand implements Command<void, BudgetDateParams> {
    constructor(
        private readonly additionalIncomeService: AdditionalIncomeService,
        private readonly unbudgetedExpenseService: UnbudgetedExpenseService,
        private readonly transactionClassificationService: TransactionClassificationService,
        private readonly paycheckSurplusService: PaycheckSurplusService,
        private readonly finalizeBudgetDisplayService: FinalizeBudgetDisplayService
    ) {}

    /**
     * Executes the finalize budget command
     * @param params The month and year to finalize budget for
     */
    async execute({ month, year }: BudgetDateParams): Promise<void> {
        console.log(this.finalizeBudgetDisplayService.formatHeader('Budget Finalization Report'));

        // Fetch all data in parallel using Result pattern
        const [additionalIncomeResult, unbudgetedExpenseResult, paycheckSurplusResult] =
            await Promise.all([
                this.additionalIncomeService.calculateAdditionalIncome(month, year),
                this.unbudgetedExpenseService.calculateUnbudgetedExpenses(month, year),
                this.paycheckSurplusService.calculatePaycheckSurplus(month, year),
            ]);

        // Handle additional income result
        if (!additionalIncomeResult.ok) {
            console.error(
                chalk.red('Error fetching additional income:'),
                chalk.red.bold(additionalIncomeResult.error.userMessage)
            );
            throw new Error(additionalIncomeResult.error.message);
        }

        // Handle unbudgeted expense result
        if (!unbudgetedExpenseResult.ok) {
            console.error(
                chalk.red('Error fetching unbudgeted expenses:'),
                chalk.red.bold(unbudgetedExpenseResult.error.userMessage)
            );
            throw new Error(unbudgetedExpenseResult.error.message);
        }

        // Handle paycheck surplus result
        if (!paycheckSurplusResult.ok) {
            console.error(
                chalk.red('Error calculating paycheck surplus:'),
                chalk.red.bold(paycheckSurplusResult.error.userMessage)
            );
            throw new Error(paycheckSurplusResult.error.message);
        }

        const additionalIncomeResults = additionalIncomeResult.value;
        const unbudgetedExpenseResults = unbudgetedExpenseResult.value;
        const paycheckSurplus = paycheckSurplusResult.value;

        console.log(this.finalizeBudgetDisplayService.formatMonthHeader(month, year));

        // Display additional income section
        console.log(
            this.finalizeBudgetDisplayService.formatAdditionalIncomeSection(additionalIncomeResults)
        );

        // Display unbudgeted expenses section
        console.log(
            this.finalizeBudgetDisplayService.formatUnbudgetedExpensesSection(
                unbudgetedExpenseResults
            )
        );

        // Calculate and display enhanced summary
        const allTransactions = [...additionalIncomeResults, ...unbudgetedExpenseResults];
        const counts = this.getTransactionCounts(allTransactions);
        console.log(
            this.finalizeBudgetDisplayService.formatSummary(
                counts,
                additionalIncomeResults,
                unbudgetedExpenseResults,
                paycheckSurplus
            )
        );
    }

    private getTransactionCounts(transactions: TransactionSplit[]): TransactionCounts {
        let bills = 0;
        let transfers = 0;
        let deposits = 0;
        let other = 0;

        transactions.forEach(t => {
            if (this.transactionClassificationService.isBill(t)) {
                bills++;
            } else if (this.transactionClassificationService.isTransfer(t)) {
                transfers++;
            } else if (this.transactionClassificationService.isDeposit(t)) {
                deposits++;
            } else {
                other++;
            }
        });

        return {
            bills,
            transfers,
            deposits,
            other,
        };
    }
}
