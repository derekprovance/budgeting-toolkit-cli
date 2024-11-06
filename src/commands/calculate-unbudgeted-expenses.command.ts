import { logger } from "../logger";
import { PrinterService } from "../services/printer.service";
import { UnbudgetedExpenseService } from "../services/unbudgeted-expense.service";

export const calculateUnbudgetedExpenses = async (
  unbudgetedExpenseService: UnbudgetedExpenseService,
  queryMonth: number
): Promise<void> => {
  try {
    const results = await unbudgetedExpenseService.calculateUnbudgetedExpenses(
      queryMonth
    );
    PrinterService.printTransactions(results, "Unbudgeted Expenses");
  } catch (ex) {
    if (ex instanceof Error) {
      logger.error("Failed to get unbudgeted expenses", ex.message);
    } else {
      logger.fatal("Unknown Error: Unbudgeted Expense", ex);
    }
  }
};
