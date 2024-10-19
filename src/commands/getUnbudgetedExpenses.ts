import { logger } from "../logger";
import { UnbudgetedExpenseService } from "../services/unbudgetedExpenseService";

export const getUnbudgetedExpenses = async (
  unbudgetedExpenseService: UnbudgetedExpenseService,
  queryMonth: number
): Promise<void> => {
  try {
    const unbudgetedExpenses =
      await unbudgetedExpenseService.getUnbudgetedExpenses(queryMonth);
  } catch (ex) {
    if(ex instanceof Error) {
        logger.error("Failed to get unbudgeted expenses", ex.message);
    } else {
        logger.fatal("Unknown Error: Unbudgeted Expense", ex);
    }
  }
};
