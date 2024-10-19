import { TransactionSplit } from "firefly-iii-sdk";
import { TransactionService } from "./transaction.service";
import { Account, Category, ExpenseAccount, Tag } from "../config";
import { UnbudgetedExpenseSummary } from "../dto/UnbudgetedExpenseSummary.dto";

export class UnbudgetedExpenseService {
  constructor(private transactionService: TransactionService) {}

  async getUnbudgetedExpenses(month: number): Promise<UnbudgetedExpenseSummary> {
    const transactions = await this.transactionService.getTransactionsForMonth(
      month
    );
    const filteredTransactions = this.filterExpenses(transactions);
    const descriptions = filteredTransactions.map(
      (t) => `${t.description}, $${t.amount}`
    );

    return {
      total: `$${this.transactionService.calculateTotal(filteredTransactions).toFixed(2)}`,
      transactions: descriptions,
    };
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
        this.isExpenseAccount(transaction.source_id)) ||
      transaction.category_id == Category.BILLS_UTILITIES
    );
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
