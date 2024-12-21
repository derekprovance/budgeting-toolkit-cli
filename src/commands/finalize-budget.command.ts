import { AdditionalIncomeService } from "../services/additional-income.service";
import { PrinterService } from "../services/printer.service";
import { UnbudgetedExpenseService } from "../services/unbudgeted-expense.service";

export const finalizeBudgetCommand = async (
  additionalIncomeService: AdditionalIncomeService,
  unbudgetedExpenseService: UnbudgetedExpenseService,
  queryMonth: number
) => {
  console.log('\n=== Budget Finalization Report ===');
  
  try {
    const additionalIncomeResults =
      await additionalIncomeService.calculateAdditionalIncome(queryMonth);

    const unbudgetedExpenseResults =
      await unbudgetedExpenseService.calculateUnbudgetedExpenses(queryMonth);

    const currentYear = new Date().getFullYear();
    const monthName = Intl.DateTimeFormat("en", { month: "long" }).format(
      new Date(currentYear, queryMonth-1)
    );
    
    console.log(`\n📅 ${monthName} ${currentYear}`);
    console.log('='.repeat(30) + '\n');
    
    PrinterService.printTransactions(
      additionalIncomeResults,
      "💰 Additional Income"
    );
    
    PrinterService.printTransactions(
      unbudgetedExpenseResults,
      "💸 Unbudgeted Expenses"
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error finalizing budget:', errorMessage);
    throw error instanceof Error ? error : new Error('Unknown error occurred');
  }
};
