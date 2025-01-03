import { TransactionService } from "./core/transaction.service";
import { Account, Tag } from "../config";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { TransactionPropertyService } from "./core/transaction-property.service";
import { logger } from "../logger";

export class UnbudgetedExpenseService {
  constructor(private transactionService: TransactionService) {}

  async calculateUnbudgetedExpenses(
    month: number,
    year: number
  ): Promise<TransactionSplit[]> {
    const transactions = await this.transactionService.getTransactionsForMonth(
      month,
      year
    );
    const filteredTransactions = await this.filterExpenses(transactions);
    return filteredTransactions;
  }

  private async filterExpenses(transactions: TransactionSplit[]) {
    const results = await Promise.all(
      transactions.map((transaction) => this.shouldCountExpense(transaction))
    );

    return transactions.filter((_, index) => results[index]);
  }

  private async shouldCountExpense(
    transaction: TransactionSplit
  ): Promise<boolean> {
    if (transaction.tags?.includes(Tag.BILLS)) {
      return true;
    }

    const isRegularExpense = await this.isRegularExpenseTransaction(
      transaction
    );
    return isRegularExpense;
  }

  private async isRegularExpenseTransaction(
    transaction: TransactionSplit
  ): Promise<boolean> {
    const isExcludedTransaction =
      await TransactionPropertyService.isExcludedTransaction(
        transaction.description,
        transaction.amount
      );

    const conditions = {
      hasNoBudget: !transaction.budget_id,
      isNotTransfer: !TransactionPropertyService.isTransfer(transaction),
      isNotDisposableSupplemented:
        !TransactionPropertyService.isSupplementedByDisposable(
          transaction.tags
        ),
      isNotExcludedTransaction: !isExcludedTransaction,
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
      conditions.isNotExcludedTransaction &&
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
