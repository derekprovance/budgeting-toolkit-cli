import { AdditionalIncomeService } from "../services/additional-income.service";
import { PrinterService } from "../services/printer.service";
import { UnbudgetedExpenseService } from "../services/unbudgeted-expense.service";

export const finalizeBudgetCommand = async (
  additionalIncomeService: AdditionalIncomeService,
  unbudgetedExpenseService: UnbudgetedExpenseService,
  queryMonth: number
) => {
  console.log("Running Budget Finalization Calculations...");
  const additionalIncomeResults =
    await additionalIncomeService.calculateAdditionalIncome(queryMonth);

  const unbudgetedExpenseResults =
    await unbudgetedExpenseService.calculateUnbudgetedExpenses(queryMonth);

  const monthName = Intl.DateTimeFormat("en", { month: "long" }).format(
    new Date(queryMonth)
  );
  console.log(
    `\n${queryMonth}: ${monthName}\n====================\n`
  );
  PrinterService.printTransactions(
    additionalIncomeResults,
    "Additional Income"
  );
  PrinterService.printTransactions(
    unbudgetedExpenseResults,
    "Unbudgeted Expenses"
  );
};
