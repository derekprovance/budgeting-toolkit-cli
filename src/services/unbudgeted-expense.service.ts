import { TransactionSplit } from "firefly-iii-sdk";
import { TransactionService } from "./transaction.service";
import { Account, Category, ExpenseAccount, Tag } from "../config";
import { PrinterService } from "./printer.service";

export class UnbudgetedExpenseService {
  constructor(private transactionService: TransactionService) {}

  async getUnbudgetedExpenses(month: number): Promise<void> {
    const transactions = await this.transactionService.getTransactionsForMonth(
      month
    );
    const filteredTransactions = this.filterExpenses(transactions);

    PrinterService.printTransactions(filteredTransactions, 'Unbudgeted Expenses');
  }

  private filterExpenses(transactions: TransactionSplit[]) {
    return transactions.filter((transaction) =>
      this.shouldCountExpense(transaction)
    );
  }

  private shouldCountExpense(transaction: TransactionSplit) {
    return (
      (!transaction.budget_id &&
        this.hasNoDestination(transaction.destination_id) &&
        !this.isSupplementedByDisposable(transaction.tags) &&
        !this.isVanguard(transaction.description) &&
        this.isExpenseAccount(transaction.source_id)) ||
      transaction.category_id == Category.BILLS_UTILITIES
    );
  }

  private isVanguard(description: string): boolean {
    return description === "VANGUARD BUY INVESTMENT"
  }

  private hasNoDestination(destinationId: string | null) {
    return destinationId === ExpenseAccount.NO_NAME;
  }

  private isSupplementedByDisposable(tags: string[] | null | undefined) {
    return tags?.includes(Tag.DISPOSABLE_INCOME);
  }

  private isExpenseAccount(sourceId: string | null) {
    if (!sourceId) {
      return false;
    }

    const foobar = [
      Account.CHASE_AMAZON.toString(),
      Account.CHASE_SAPPHIRE.toString(),
      Account.CITIBANK_DOUBLECASH.toString(),
      Account.PRIMARY.toString(),
    ].includes(sourceId);
    return foobar;
  }
}
