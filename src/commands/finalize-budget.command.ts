import { Command } from "../types/interface/command.interface";
import { BudgetDateParams } from "../types/interface/budget-date-params.interface";
import { AdditionalIncomeService } from "../services/additional-income.service";
import { UnbudgetedExpenseService } from "../services/unbudgeted-expense.service";
import { TransactionPropertyService } from "../services/core/transaction-property.service";
import { FinalizeBudgetDisplayService } from "../services/display/finalize-budget-display.service";
import { PaycheckSurplusService } from "../services/paycheck-surplus.service";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { TransactionCounts } from "../services/display/finalize-budget-display.service";
import chalk from "chalk";

/**
 * Command for finalizing budget and displaying the finalization report
 */

//TODO(DEREK) - calculate the amount of budget left for transfer into and out of disposable
//TODO(DEREK) - Find a way to list all transactions without a budget that are not a bill or disposable income
export class FinalizeBudgetCommand implements Command<void, BudgetDateParams> {
    private readonly displayService: FinalizeBudgetDisplayService;

    constructor(
        private readonly additionalIncomeService: AdditionalIncomeService,
        private readonly unbudgetedExpenseService: UnbudgetedExpenseService,
        private readonly transactionPropertyService: TransactionPropertyService,
        private readonly paycheckSurplusService: PaycheckSurplusService,
    ) {
        this.displayService = new FinalizeBudgetDisplayService(
            transactionPropertyService,
        );
    }

    /**
     * Executes the finalize budget command
     * @param params The month and year to finalize budget for
     */
    async execute({ month, year }: BudgetDateParams): Promise<void> {
        try {
            console.log(
                this.displayService.formatHeader("Budget Finalization Report"),
            );

            const [
                additionalIncomeResults,
                unbudgetedExpenseResults,
                paycheckSurplus,
            ] = await Promise.all([
                this.additionalIncomeService.calculateAdditionalIncome(
                    month,
                    year,
                ),
                this.unbudgetedExpenseService.calculateUnbudgetedExpenses(
                    month,
                    year,
                ),
                this.paycheckSurplusService.calculatePaycheckSurplus(
                    month,
                    year,
                ),
            ]);

            console.log(this.displayService.formatMonthHeader(month, year));

            // Display additional income section
            console.log(
                this.displayService.formatAdditionalIncomeSection(
                    additionalIncomeResults,
                ),
            );

            // Display unbudgeted expenses section
            console.log(
                this.displayService.formatUnbudgetedExpensesSection(
                    unbudgetedExpenseResults,
                ),
            );

            // Calculate and display enhanced summary
            const allTransactions = [
                ...additionalIncomeResults,
                ...unbudgetedExpenseResults,
            ];
            const counts = this.getTransactionCounts(allTransactions);
            console.log(
                this.displayService.formatSummary(
                    counts,
                    additionalIncomeResults,
                    unbudgetedExpenseResults,
                    paycheckSurplus,
                ),
            );
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            console.error(
                chalk.red("Error finalizing budget:"),
                chalk.red.bold(errorMessage),
            );
            throw error; // Re-throw to allow proper error handling up the chain
        }
    }

    private getTransactionCounts(
        transactions: TransactionSplit[],
    ): TransactionCounts {
        let bills = 0;
        let transfers = 0;
        let deposits = 0;
        let other = 0;

        transactions.forEach((t) => {
            if (this.transactionPropertyService.isBill(t)) {
                bills++;
            } else if (this.transactionPropertyService.isTransfer(t)) {
                transfers++;
            } else if (this.transactionPropertyService.isDeposit(t)) {
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
