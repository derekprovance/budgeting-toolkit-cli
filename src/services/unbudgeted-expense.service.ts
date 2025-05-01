import { TransactionService } from "./core/transaction.service";
import { Account } from "../config";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { TransactionPropertyService } from "./core/transaction-property.service";
import { logger } from "../logger";
import { DateUtils } from "../utils/date.utils";

/**
 * Service for calculating unbudgeted expenses.
 * 
 * 1. A transaction is considered an unbudgeted expense if:
 *    - It is a bill (has the "Bills" tag), OR
 *    - It meets all regular expense criteria:
 *      - Has no budget assigned
 *      - Not supplemented by disposable income
 *      - Not in excluded transactions list
 *      - From a valid expense account
 * 
 * 2. Valid expense accounts are:
 *    - PRIMARY
 *    - CHASE_AMAZON
 *    - CHASE_SAPPHIRE
 *    - CITIBANK_DOUBLECASH
 * 
 * 3. Transfers are handled specially:
 *    - Must be from PRIMARY to MONEY_MARKET
 *    - Must meet all other criteria
 */
export class UnbudgetedExpenseService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly transactionPropertyService: TransactionPropertyService
  ) {}

  /**
   * Calculates unbudgeted expenses for a given month and year.
   * 
   * 1. Get all transactions for the month
   * 2. Filter transactions based on criteria:
   *    - Bills are always included
   *    - Regular expenses must meet all criteria
   *    - Transfers must meet special criteria
   */
  async calculateUnbudgetedExpenses(
    month: number,
    year: number
  ): Promise<TransactionSplit[]> {
    try {
      DateUtils.validateMonthYear(month, year);
      const transactions =
        await this.transactionService.getTransactionsForMonth(month, year);
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

  /**
   * Filters transactions to find unbudgeted expenses.
   * 
   * 1. For each transaction:
   *    - If it's a bill, include it
   *    - If it's a transfer, check transfer criteria
   *    - Otherwise, check regular expense criteria
   */
  private async filterExpenses(transactions: TransactionSplit[]) {
    const results = await Promise.all(
      transactions.map(async (transaction) => {
        const isTransfer =
          this.transactionPropertyService.isTransfer(transaction);
        const shouldCountExpense = await this.shouldCountExpense(transaction);

        return (
          (!isTransfer && shouldCountExpense) ||
          (shouldCountExpense && this.shouldCountTransfer(transaction))
        );
      })
    );

    return transactions.filter((_, index) => results[index]);
  }

  /**
   * Checks if a transfer should be counted as an unbudgeted expense.
   * 
   * 1. If no destination account, count it
   * 2. Otherwise, must be from PRIMARY to MONEY_MARKET
   */
  private shouldCountTransfer(transaction: TransactionSplit): boolean {
    if (!transaction.destination_id) {
      return true;
    }

    return (
      transaction.source_id === Account.PRIMARY &&
      [Account.MONEY_MARKET].includes(transaction.destination_id as Account)
    );
  }

  /**
   * Checks if a transaction should be counted as an expense.
   * 
   * 1. If it's a bill, always count it
   * 2. Otherwise, check regular expense criteria
   */
  private async shouldCountExpense(
    transaction: TransactionSplit
  ): Promise<boolean> {
    if (this.transactionPropertyService.isBill(transaction)) {
      return true;
    }
    return this.isRegularExpenseTransaction(transaction);
  }

  /**
   * Checks if a transaction is a regular unbudgeted expense.
   * 
   * 1. Must have no budget assigned
   * 2. Must not be supplemented by disposable income
   * 3. Must not be in excluded transactions list
   * 4. Must be from a valid expense account
   */
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

  /**
   * Checks if an account is a valid expense account.
   * 
   * 1. Must be one of:
   *    - PRIMARY
   *    - CHASE_AMAZON
   *    - CHASE_SAPPHIRE
   *    - CITIBANK_DOUBLECASH
   */
  private isExpenseAccount(accountId: string | null): boolean {
    if (!accountId) {
      return false;
    }

    return [
      Account.CHASE_AMAZON,
      Account.CHASE_SAPPHIRE,
      Account.CITIBANK_DOUBLECASH,
      Account.PRIMARY,
    ].includes(accountId as Account);
  }
}
