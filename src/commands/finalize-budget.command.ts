import { AdditionalIncomeService } from "../services/additional-income.service";
import { PrinterService } from "../services/printer.service";
import { UnbudgetedExpenseService } from "../services/unbudgeted-expense.service";
import chalk from 'chalk';

export const finalizeBudgetCommand = async (
  additionalIncomeService: AdditionalIncomeService,
  unbudgetedExpenseService: UnbudgetedExpenseService,
  queryMonth: number
) => {
  console.log('\n' + chalk.bold.blue('=== Budget Finalization Report ==='));
  
  try {
    const additionalIncomeResults =
      await additionalIncomeService.calculateAdditionalIncome(queryMonth);

    const unbudgetedExpenseResults =
      await unbudgetedExpenseService.calculateUnbudgetedExpenses(queryMonth);

    const currentYear = new Date().getFullYear();
    const monthName = Intl.DateTimeFormat("en", { month: "long" }).format(
      new Date(currentYear, queryMonth-1)
    );
    
    console.log(`\n📅 ${chalk.cyan(monthName)} ${chalk.cyan(currentYear)}`);
    console.log(chalk.gray('='.repeat(30)) + '\n');
    
    PrinterService.printTransactions(
      additionalIncomeResults,
      chalk.green('💰 Additional Income')
    );
    
    PrinterService.printTransactions(
      unbudgetedExpenseResults,
      chalk.red('💸 Unbudgeted Expenses')
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(chalk.red('❌ Error finalizing budget:'), chalk.red.bold(errorMessage));
    throw error instanceof Error ? error : new Error('Unknown error occurred');
  }
};
