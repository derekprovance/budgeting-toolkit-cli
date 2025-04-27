import { TransactionService } from "./core/transaction.service";
import { Account } from "../config";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { TransactionPropertyService } from "./core/transaction-property.service";
import { logger } from "../logger";
import { DateUtils } from "../utils/date.utils";

export class UnbudgetedExpenseService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly transactionPropertyService: TransactionPropertyService
  ) {}

  async calculateUnbudgetedExpenses(
    month: number,
    year: number
  ): Promise<TransactionSplit[]> {
    try {
      DateUtils.validateMonthYear(month, year);
      const transactions = await this.transactionService.getTransactionsForMonth(
        month,
        year
      );
      const expenses = await this.filterExpenses(transactions);

      return expenses;
    } catch (error) {
      logger.trace(error, "Error calculating unbudgeted expenses", {
        month,
        year,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      if (error instanceof Error) {
        throw new Error(
          `Failed to calculate unbudgeted expenses for month ${month}: ${error.message}`
        );
      }
      throw new Error(
        `Failed to calculate unbudgeted expenses for month ${month}`
      );
    }
  }

  private async filterExpenses(transactions: TransactionSplit[]) {
    const results = await Promise.all(
      transactions.map(async (transaction) => {
        const isTransfer = this.transactionPropertyService.isTransfer(transaction);
        const shouldCountExpense = await this.shouldCountExpense(transaction);

        return (
          (!isTransfer && shouldCountExpense) ||
          (shouldCountExpense && this.shouldCountTransfer(transaction))
        );
      })
    );

    return transactions.filter((_, index) => results[index]);
  }

  private shouldCountTransfer(transaction: TransactionSplit): boolean {
    if (!transaction.destination_id) {
      return true;
    }

    return (
      transaction.source_id === Account.PRIMARY &&
      [Account.MONEY_MARKET].includes(transaction.destination_id as Account)
    );
  }

  private async shouldCountExpense(transaction: TransactionSplit): Promise<boolean> {
    return this.isRegularExpenseTransaction(transaction);
  }

  private async isRegularExpenseTransaction(
    transaction: TransactionSplit
  ): Promise<boolean> {
    const isExcludedTransaction =
      await this.transactionPropertyService.isExcludedTransaction(
        transaction.description,
        transaction.amount
      );

    const conditions = {
      hasNoBudget: !transaction.budget_id,
      isNotDisposableSupplemented:
        !this.transactionPropertyService.isSupplementedByDisposable(
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
      conditions.isNotDisposableSupplemented &&
      conditions.isNotExcludedTransaction &&
      conditions.isFromExpenseAccount
    );
  }

  private isExpenseAccount(accountId: string | null): boolean {
    return accountId === Account.PRIMARY;
  }
}
