import { TransactionService } from "./core/transaction.service";
import { Account, Description, ExpenseAccount, Tag } from "../config";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";

export class UnbudgetedExpenseService {
  constructor(private transactionService: TransactionService) {}

  async calculateUnbudgetedExpenses(
    month: number
  ): Promise<TransactionSplit[]> {
    const transactions = await this.transactionService.getTransactionsForMonth(
      month
    );
    const filteredTransactions = this.filterExpenses(transactions);
    return filteredTransactions;
  }

  private filterExpenses(transactions: TransactionSplit[]) {
    return transactions.filter((transaction) =>
      this.shouldCountExpense(transaction)
    );
  }

  private shouldCountExpense(transaction: TransactionSplit): boolean {
    if (transaction.tags?.includes(Tag.BILLS)) {
      return true;
    }

    const isRegularExpense = this.isRegularExpenseTransaction(transaction);
    return isRegularExpense;
  }

  private isRegularExpenseTransaction(transaction: TransactionSplit): boolean {
    const conditions = {
      hasNoBudget: !transaction.budget_id,
      hasNoDestination: this.hasNoDestination(transaction.destination_id),
      isNotDisposableSupplemented: !this.isSupplementedByDisposable(
        transaction.tags
      ),
      isNotVanguardTransaction: !this.isVanguard(transaction.description),
      isFromExpenseAccount: this.isExpenseAccount(transaction.source_id),
    };

    return (
      conditions.hasNoBudget &&
      conditions.hasNoDestination &&
      conditions.isNotDisposableSupplemented &&
      conditions.isNotVanguardTransaction &&
      conditions.isFromExpenseAccount
    );
  }

  private isVanguard(description: string): boolean {
    return description === Description.VANGUARD_INVESTMENT;
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

    return [
      Account.CHASE_AMAZON.toString(),
      Account.CHASE_SAPPHIRE.toString(),
      Account.CITIBANK_DOUBLECASH.toString(),
      Account.PRIMARY.toString(),
    ].includes(sourceId);
  }
}
