import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { AdditionalIncomeService } from "../services/additional-income.service";
import { UnbudgetedExpenseService } from "../services/unbudgeted-expense.service";
import chalk from "chalk";
import { TransactionPropertyService } from "../services/core/transaction-property.service";

export const finalizeBudgetCommand = async (
  additionalIncomeService: AdditionalIncomeService,
  unbudgetedExpenseService: UnbudgetedExpenseService,
  queryMonth: number,
  queryYear: number
) => {
  console.log("\n" + chalk.bold.cyan("=== Budget Finalization Report ==="));

  try {
    const additionalIncomeResults =
      await additionalIncomeService.calculateAdditionalIncome(
        queryMonth,
        queryYear
      );

    const unbudgetedExpenseResults =
      await unbudgetedExpenseService.calculateUnbudgetedExpenses(
        queryMonth,
        queryYear
      );

    const monthName = Intl.DateTimeFormat("en", { month: "long" }).format(
      new Date(queryYear, queryMonth - 1)
    );

    console.log(chalk.cyan(`\nBudget Report for ${monthName} ${queryYear}`));

    // Helper function to get transaction type indicator
    const getTransactionTypeIndicator = (transaction: TransactionSplit) => {
      if (TransactionPropertyService.isBill(transaction)) {
        return chalk.magenta("[BILL]");
      } else if (TransactionPropertyService.isTransfer(transaction)) {
        return chalk.cyan("[TRANSFER]");
      } else if (TransactionPropertyService.isDeposit(transaction)) {
        return chalk.yellow("[DEPOSIT]");
      }
      return chalk.gray("[OTHER]");
    };

    // Display Additional Income Section
    console.log(chalk.bold("\n=== Additional Income ===\n"));

    if (additionalIncomeResults.length === 0) {
      console.log(chalk.dim("No additional income transactions found"));
    } else {
      const totalAdditionalIncome = additionalIncomeResults.reduce(
        (sum, transaction) => sum + parseFloat(transaction.amount),
        0
      );

      additionalIncomeResults.forEach((transaction: TransactionSplit) => {
        const type = getTransactionTypeIndicator(transaction);
        const amount = parseFloat(transaction.amount);
        const date = new Date(transaction.date).toLocaleDateString();
        const amountStr = `${transaction.currency_symbol}${Math.abs(
          amount
        ).toFixed(2)}`;

        console.log(`${type} ${chalk.white(transaction.description)}`);
        console.log(
          chalk.dim(`    Date: ${date}`).padEnd(35) +
            chalk.blue(`Amount: ${amountStr}`)
        );
        if (transaction.category_name) {
          console.log(chalk.dim(`    Category: ${transaction.category_name}`));
        }
        console.log(); // Add extra spacing between transactions
      });

      console.log(
        chalk.cyan.bold(
          `Total Additional Income: ${
            additionalIncomeResults[0]?.currency_symbol
          }${totalAdditionalIncome.toFixed(2)}`
        )
      );
    }

    // Display Unbudgeted Expenses Section
    console.log(chalk.bold("\n=== Unbudgeted Expenses ===\n"));

    if (unbudgetedExpenseResults.length === 0) {
      console.log(chalk.dim("No unbudgeted expense transactions found"));
    } else {
      const totalUnbudgetedExpenses = unbudgetedExpenseResults.reduce(
        (sum, transaction) => sum + parseFloat(transaction.amount),
        0
      );

      unbudgetedExpenseResults.forEach((transaction: TransactionSplit) => {
        const type = getTransactionTypeIndicator(transaction);
        const amount = parseFloat(transaction.amount);
        const date = new Date(transaction.date).toLocaleDateString();
        const amountStr = `${transaction.currency_symbol}${Math.abs(
          amount
        ).toFixed(2)}`;

        console.log(`${type} ${chalk.white(transaction.description)}`);
        console.log(
          chalk.dim(`    Date: ${date}`).padEnd(35) +
            chalk.yellow(`Amount: ${amountStr}`)
        );
        if (transaction.category_name) {
          console.log(chalk.dim(`    Category: ${transaction.category_name}`));
        }
        console.log(); // Add extra spacing between transactions
      });

      console.log(
        chalk.yellow.bold(
          `Total Unbudgeted Expenses: ${
            unbudgetedExpenseResults[0]?.currency_symbol
          }${totalUnbudgetedExpenses.toFixed(2)}`
        )
      );
    }

    const currencySymbol =
      additionalIncomeResults[0]?.currency_symbol ||
      unbudgetedExpenseResults[0]?.currency_symbol ||
      "$";

    // Get transaction counts
    const allTransactions = [
      ...additionalIncomeResults,
      ...unbudgetedExpenseResults,
    ];
    const counts = {
      bills: allTransactions.filter((t) => TransactionPropertyService.isBill(t))
        .length,
      transfers: allTransactions.filter((t) =>
        TransactionPropertyService.isTransfer(t)
      ).length,
      deposits: allTransactions.filter((t) =>
        TransactionPropertyService.isDeposit(t)
      ).length,
    };

    console.log(chalk.bold("\n=== Summary ===\n"));
    console.log("Transaction Types:");
    console.log(`  ${chalk.magenta("Bills:")}\t${counts.bills}`);
    console.log(`  ${chalk.cyan("Transfers:")}\t${counts.transfers}`);
    console.log(`  ${chalk.yellow("Deposits:")}\t${counts.deposits}`);
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
};
