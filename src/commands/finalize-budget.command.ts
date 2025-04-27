import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { AdditionalIncomeService } from "../services/additional-income.service";
import { UnbudgetedExpenseService } from "../services/unbudgeted-expense.service";
import chalk from "chalk";
import { TransactionPropertyService } from "../services/core/transaction-property.service";
import { Command } from "../types/interface/command.interface";
import { BudgetDateParams } from "../types/interface/budget-date-params.interface";

export class FinalizeBudgetCommand implements Command<void, BudgetDateParams> {
  constructor(
    private readonly additionalIncomeService: AdditionalIncomeService,
    private readonly unbudgetedExpenseService: UnbudgetedExpenseService,
    private readonly transactionPropertyService: TransactionPropertyService
  ) {}

  async execute({ month, year }: BudgetDateParams): Promise<void> {
    console.log(this.generateBoxHeader("Budget Finalization Report"));

    try {
      const additionalIncomeResults =
        await this.additionalIncomeService.calculateAdditionalIncome(
          month,
          year
        );

      const unbudgetedExpenseResults =
        await this.unbudgetedExpenseService.calculateUnbudgetedExpenses(
          month,
          year
        );

      const monthName = Intl.DateTimeFormat("en", { month: "long" }).format(
        new Date(year, month - 1)
      );

      console.log(chalk.cyan(`\nBudget Report for ${monthName} ${year}`));

      this.displayAdditionalIncomeSection(additionalIncomeResults);
      this.displayUnbudgetedExpensesSection(unbudgetedExpenseResults);

      const currencySymbol =
        additionalIncomeResults[0]?.currency_symbol ||
        unbudgetedExpenseResults[0]?.currency_symbol ||
        "$";

      // Get transaction counts
      const counts = this.getTransactionCounts(additionalIncomeResults, unbudgetedExpenseResults);

      console.log(chalk.bold("\n=== Summary ===\n"));
      console.log("Transaction Types:");
      console.log(`  ${chalk.redBright("Bills:")}\t${counts.bills}`);
      console.log(`  ${chalk.cyan("Transfers:")}\t${counts.transfers}`);
      console.log(`  ${chalk.greenBright("Deposits:")}\t${counts.deposits}`);
      console.log(`  ${chalk.gray("Other:")}\t${counts.other}`);
      console.log(); // Add spacing
      console.log("Final Totals:");
      const totalAdditionalIncome = additionalIncomeResults.reduce(
        (sum, transaction) => sum + parseFloat(transaction.amount),
        0
      );
      const totalUnbudgetedExpenses = unbudgetedExpenseResults.reduce(
        (sum, transaction) => sum + parseFloat(transaction.amount),
        0
      );

      console.log(
        `  Additional Income:     ${chalk.cyanBright(
          `${currencySymbol}${totalAdditionalIncome.toFixed(2)}`
        )}`
      );
      console.log(
        `  Unbudgeted Expenses:   ${chalk.cyanBright(
          `${currencySymbol}${Math.abs(totalUnbudgetedExpenses).toFixed(2)}`
        )}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        chalk.red("❌ Error finalizing budget:"),
        chalk.red.bold(errorMessage)
      );
    }
  }

  private generateBoxHeader(text: string): string {
    const padding = 2;
    const textLength = text.length;
    const totalLength = textLength + padding * 2;

    const topBorder = "╔" + "═".repeat(totalLength) + "╗";
    const middleLine =
      "║" + " ".repeat(padding) + text + " ".repeat(padding) + "║";
    const bottomBorder = "╚" + "═".repeat(totalLength) + "╝";

    return `\n${chalk.cyan(topBorder)}\n${chalk.cyan(middleLine)}\n${chalk.cyan(
      bottomBorder
    )}`;
  }

  private getTransactionCounts(additionalIncomeResults: TransactionSplit[], unbudgetedExpenseResults: TransactionSplit[]) {
    const allTransactions = [
      ...additionalIncomeResults,
      ...unbudgetedExpenseResults,
    ];
    return {
      bills: allTransactions.filter((t) => this.transactionPropertyService.isBill(t))
        .length,
      transfers: allTransactions.filter((t) =>
        this.transactionPropertyService.isTransfer(t)
      ).length,
      deposits: allTransactions.filter((t) =>
        this.transactionPropertyService.isDeposit(t)
      ).length,
      other: allTransactions.filter((t) => 
        !this.transactionPropertyService.isBill(t) && 
        !this.transactionPropertyService.isTransfer(t) && 
        !this.transactionPropertyService.isDeposit(t)
      ).length
    };
  }

  private displayAdditionalIncomeSection(
    additionalIncomeResults: TransactionSplit[]
  ) {
    console.log(chalk.bold("\n=== Additional Income ===\n"));

    if (additionalIncomeResults.length === 0) {
      console.log(chalk.dim("No additional income transactions found"));
    } else {
      const totalAdditionalIncome = additionalIncomeResults.reduce(
        (sum, transaction) => sum + parseFloat(transaction.amount),
        0
      );

      additionalIncomeResults.forEach((transaction: TransactionSplit) =>
        this.printTransaction(transaction)
      );

      console.log(
        chalk.cyan.bold(
          `Total Additional Income: ${
            additionalIncomeResults[0]?.currency_symbol
          }${totalAdditionalIncome.toFixed(2)}`
        )
      );
    }
  }

  private displayUnbudgetedExpensesSection(
    unbudgetedExpenseResults: TransactionSplit[]
  ) {
    console.log(chalk.bold("\n=== Unbudgeted Expenses ===\n"));

    if (unbudgetedExpenseResults.length === 0) {
      console.log(chalk.dim("No unbudgeted expense transactions found"));
    } else {
      const totalUnbudgetedExpenses = unbudgetedExpenseResults.reduce(
        (sum, transaction) => sum + parseFloat(transaction.amount),
        0
      );

      unbudgetedExpenseResults.forEach((transaction: TransactionSplit) =>
        this.printTransaction(transaction)
      );

      console.log(
        chalk.yellow.bold(
          `Total Unbudgeted Expenses: ${
            unbudgetedExpenseResults[0]?.currency_symbol
          }${totalUnbudgetedExpenses.toFixed(2)}`
        )
      );
    }
  }

  private printTransaction(transaction: TransactionSplit) {
    const type = this.getTransactionTypeIndicator(transaction);
    const amount = parseFloat(transaction.amount);
    const date = new Date(transaction.date).toLocaleDateString();
    const amountStr = `${transaction.currency_symbol}${Math.abs(amount).toFixed(
      2
    )}`;

    console.log(`${type} ${chalk.white(transaction.description)}`);
    console.log(
      chalk.dim(`    Date: ${date}`).padEnd(35) +
        chalk.yellow(`Amount: ${amountStr}`)
    );
    if (transaction.category_name) {
      console.log(chalk.dim(`    Category: ${transaction.category_name}`));
    }
    console.log(); // Add extra spacing between transactions
  }

  private getTransactionTypeIndicator(transaction: TransactionSplit) {
    if (this.transactionPropertyService.isBill(transaction)) {
      return chalk.redBright("[BILL]");
    } else if (this.transactionPropertyService.isTransfer(transaction)) {
      return chalk.yellowBright("[TRANSFER]");
    } else if (this.transactionPropertyService.isDeposit(transaction)) {
      return chalk.greenBright("[DEPOSIT]");
    }
    return chalk.gray("[OTHER]");
  }
}
