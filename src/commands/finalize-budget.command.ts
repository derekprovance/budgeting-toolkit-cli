import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { AdditionalIncomeService } from "../services/additional-income.service";
import { TransactionPropertyService } from "../services/core/transaction-property.service";
import { UnbudgetedExpenseService } from "../services/unbudgeted-expense.service";
import chalk from "chalk";

export const finalizeBudgetCommand = async (
  additionalIncomeService: AdditionalIncomeService,
  unbudgetedExpenseService: UnbudgetedExpenseService,
  queryMonth: number,
  queryYear: number
) => {
  console.log("\n" + chalk.bold.blue("=== Budget Finalization Report ==="));

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

    // Print report header with month and year
    console.log(chalk.cyan(`\nBudget Report for ${monthName} ${queryYear}`));

    // Helper function to get transaction type indicator
    const getTransactionTypeIndicator = (transaction: TransactionSplit) => {
      if (TransactionPropertyService.isBill(transaction)) {
        return chalk.magenta("📄 [Bill]");
      } else if (TransactionPropertyService.isTransfer(transaction)) {
        return chalk.blue("↔️  [Transfer]");
      } else if (TransactionPropertyService.isDeposit(transaction)) {
        return chalk.green("⬇️  [Deposit]");
      }
      return chalk.gray("•");
    };

    // Display Additional Income Section
    console.log(chalk.yellow("\n=== Additional Income ==="));

    if (additionalIncomeResults.length === 0) {
      console.log(chalk.dim("No additional income transactions found"));
    } else {
      let totalAdditionalIncome = 0;

      additionalIncomeResults.forEach((transaction: TransactionSplit) => {
        const amount = parseFloat(transaction.amount);
        totalAdditionalIncome += amount;
        const typeIndicator = getTransactionTypeIndicator(transaction);

        console.log(
          `\n${typeIndicator} ${chalk.white(transaction.description)}`
        );
        console.log(
          chalk.green(
            `  Amount: ${transaction.currency_symbol}${amount.toFixed(2)}`
          )
        );
        if (transaction.date) {
          console.log(
            chalk.dim(
              `  Date: ${new Date(transaction.date).toLocaleDateString()}`
            )
          );
        }
        if (transaction.category_name) {
          console.log(chalk.dim(`  Category: ${transaction.category_name}`));
        }
        if (transaction.source_name && transaction.destination_name) {
          console.log(
            chalk.dim(
              `  From: ${transaction.source_name} → To: ${transaction.destination_name}`
            )
          );
        }
      });

      console.log(
        chalk.green.bold(
          `\nTotal Additional Income: ${
            additionalIncomeResults[0]?.currency_symbol
          }${totalAdditionalIncome.toFixed(2)}`
        )
      );
    }

    // Display Unbudgeted Expenses Section
    console.log(chalk.yellow("\n=== Unbudgeted Expenses ==="));

    if (unbudgetedExpenseResults.length === 0) {
      console.log(chalk.dim("No unbudgeted expense transactions found"));
    } else {
      let totalUnbudgetedExpenses = 0;

      unbudgetedExpenseResults.forEach((transaction: TransactionSplit) => {
        const amount = parseFloat(transaction.amount);
        totalUnbudgetedExpenses += amount;
        const typeIndicator = getTransactionTypeIndicator(transaction);

        console.log(
          `\n${typeIndicator} ${chalk.white(transaction.description)}`
        );
        console.log(
          chalk.red(
            `  Amount: ${transaction.currency_symbol}${amount.toFixed(2)}`
          )
        );
        if (transaction.date) {
          console.log(
            chalk.dim(
              `  Date: ${new Date(transaction.date).toLocaleDateString()}`
            )
          );
        }
        if (transaction.category_name) {
          console.log(chalk.dim(`  Category: ${transaction.category_name}`));
        }
        if (transaction.source_name && transaction.destination_name) {
          console.log(
            chalk.dim(
              `  From: ${transaction.source_name} → To: ${transaction.destination_name}`
            )
          );
        }
      });

      console.log(
        chalk.red.bold(
          `\nTotal Unbudgeted Expenses: ${
            unbudgetedExpenseResults[0]?.currency_symbol
          }${totalUnbudgetedExpenses.toFixed(2)}`
        )
      );
    }

    // Display Summary
    console.log(chalk.cyan("\n=== Summary ==="));
    const totalAdditionalIncome = additionalIncomeResults.reduce(
      (sum, transaction) => sum + parseFloat(transaction.amount),
      0
    );
    const totalUnbudgetedExpenses = unbudgetedExpenseResults.reduce(
      (sum, transaction) => sum + parseFloat(transaction.amount),
      0
    );
    const netAmount = totalAdditionalIncome - totalUnbudgetedExpenses;

    const currencySymbol =
      additionalIncomeResults[0]?.currency_symbol ||
      unbudgetedExpenseResults[0]?.currency_symbol ||
      "$";

    // Display transaction type counts in summary
    const incomeCounts = {
      bills: additionalIncomeResults.filter((t) =>
        TransactionPropertyService.isBill(t)
      ).length,
      transfers: additionalIncomeResults.filter((t) =>
        TransactionPropertyService.isTransfer(t)
      ).length,
      deposits: additionalIncomeResults.filter((t) =>
        TransactionPropertyService.isDeposit(t)
      ).length,
    };

    const expenseCounts = {
      bills: unbudgetedExpenseResults.filter((t) =>
        TransactionPropertyService.isBill(t)
      ).length,
      transfers: unbudgetedExpenseResults.filter((t) =>
        TransactionPropertyService.isTransfer(t)
      ).length,
      deposits: unbudgetedExpenseResults.filter((t) =>
        TransactionPropertyService.isDeposit(t)
      ).length,
    };

    console.log(chalk.cyan("\nTransaction Types:"));
    console.log(
      chalk.magenta(`Bills: ${incomeCounts.bills + expenseCounts.bills}`)
    );
    console.log(
      chalk.blue(
        `Transfers: ${incomeCounts.transfers + expenseCounts.transfers}`
      )
    );
    console.log(
      chalk.green(`Deposits: ${incomeCounts.deposits + expenseCounts.deposits}`)
    );

    console.log(chalk.cyan("\nTotals:"));
    console.log(
      chalk.green(
        `Total Additional Income: ${currencySymbol}${totalAdditionalIncome.toFixed(
          2
        )}`
      )
    );
    console.log(
      chalk.red(
        `Total Unbudgeted Expenses: ${currencySymbol}${totalUnbudgetedExpenses.toFixed(
          2
        )}`
      )
    );
    console.log(
      chalk.bold(
        netAmount >= 0
          ? chalk.green(`Net Amount: ${currencySymbol}${netAmount.toFixed(2)}`)
          : chalk.red(`Net Amount: ${currencySymbol}${netAmount.toFixed(2)}`)
      )
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
