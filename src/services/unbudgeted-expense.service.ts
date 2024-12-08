import { TransactionService } from "./core/transaction.service";
import { Account, Tag } from "../config";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { TransactionProperty } from "./core/transaction-property.service";
import { logger } from "../logger";

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
      isNotTransfer: !TransactionProperty.isTransfer(transaction),
      isNotDisposableSupplemented:
        !TransactionProperty.isSupplementedByDisposable(transaction.tags),
      isNotMonthlyInvestment: !TransactionProperty.isMonthlyInvestment(
        transaction.description,
        transaction.amount
      ),
      isFromExpenseAccount: this.isExpenseAccount(transaction.source_id),
    };

    logger.trace(
      conditions,
      `isRegularExpenseTransaction: ${transaction.description}`
    );

    return (
      conditions.hasNoBudget &&
      conditions.isNotTransfer &&
      conditions.isNotDisposableSupplemented &&
      conditions.isNotMonthlyInvestment &&
      conditions.isFromExpenseAccount
    );
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
