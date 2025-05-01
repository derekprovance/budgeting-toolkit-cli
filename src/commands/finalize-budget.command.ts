import { Command } from "../types/interface/command.interface";
import { BudgetDateParams } from "../types/interface/budget-date-params.interface";
import { AdditionalIncomeService } from "../services/additional-income.service";
import { UnbudgetedExpenseService } from "../services/unbudgeted-expense.service";
import { TransactionPropertyService } from "../services/core/transaction-property.service";
import { FinalizeBudgetDisplayService } from "../services/display/finalize-budget-display.service";
import chalk from "chalk";

/**
 * Command for finalizing budget and displaying the finalization report
 */
export class FinalizeBudgetCommand implements Command<void, BudgetDateParams> {
  private readonly displayService: FinalizeBudgetDisplayService;

  constructor(
    private readonly additionalIncomeService: AdditionalIncomeService,
    private readonly unbudgetedExpenseService: UnbudgetedExpenseService,
    private readonly transactionPropertyService: TransactionPropertyService
  ) {
    this.displayService = new FinalizeBudgetDisplayService(
      transactionPropertyService
    );
  }

  /**
   * Executes the finalize budget command
   * @param params The month and year to finalize budget for
   */
  async execute({ month, year }: BudgetDateParams): Promise<void> {
    try {
      console.log(
        this.displayService.formatHeader("Budget Finalization Report")
      );

      const [additionalIncomeResults, unbudgetedExpenseResults] =
        await Promise.all([
          this.additionalIncomeService.calculateAdditionalIncome(month, year),
          this.unbudgetedExpenseService.calculateUnbudgetedExpenses(
            month,
            year
          ),
        ]);

      console.log(this.displayService.formatMonthHeader(month, year));

      // Display additional income section
      console.log(
        this.displayService.formatAdditionalIncomeSection(
          additionalIncomeResults
        )
      );

      // Display unbudgeted expenses section
      console.log(
        this.displayService.formatUnbudgetedExpensesSection(
          unbudgetedExpenseResults
        )
      );

      // Calculate and display summary
      const allTransactions = [
        ...additionalIncomeResults,
        ...unbudgetedExpenseResults,
      ];
      const counts = this.displayService.getTransactionCounts(allTransactions);
      console.log(
        this.displayService.formatSummary(
          counts,
          additionalIncomeResults,
          unbudgetedExpenseResults
        )
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        chalk.red("❌ Error finalizing budget:"),
        chalk.red.bold(errorMessage)
      );
      throw error; // Re-throw to allow proper error handling up the chain
    }
  }
}
