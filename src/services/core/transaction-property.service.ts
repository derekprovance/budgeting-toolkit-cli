import {
  TransactionSplit,
  TransactionTypeProperty,
} from "@derekprovance/firefly-iii-sdk";
import { ExpenseAccount, Tag } from "../../config";
import { ExcludedTransactionService } from "../exluded-transaction.service";

export class TransactionPropertyService {
  static isTransfer = (transaction: TransactionSplit): boolean =>
    transaction.type === TransactionTypeProperty.TRANSFER;

  static isBill = (transaction: TransactionSplit): boolean =>
    transaction.tags ? transaction.tags?.includes(Tag.BILLS) : false;

  static isDisposableIncome(transaction: TransactionSplit): boolean {
    if (!transaction.tags) {
      return false;
    }

    return transaction.tags.includes(Tag.DISPOSABLE_INCOME);
  }

  static hasNoDestination(destinationId: string | null) {
    return destinationId === ExpenseAccount.NO_NAME;
  }

  static isSupplementedByDisposable = (
    tags: string[] | null | undefined
  ): boolean => tags?.includes(Tag.DISPOSABLE_INCOME) ?? false;

  static async isExcludedTransaction(
    description: string,
    amount: string
  ): Promise<boolean> {
    const excludedTransactions = await ExcludedTransactionService.getTransactions();
    const convertedAmount = this.convertCurrencyToFloat(amount);

    return excludedTransactions.some((transaction) => {
      if (!transaction.description && !transaction.amount) {
        return false;
      }

      if (transaction.description && transaction.amount) {
        return transaction.description === description && 
               transaction.amount === convertedAmount;
      }

      if (transaction.description) {
        return transaction.description === description;
      }

      if (transaction.amount) {
        return transaction.amount === convertedAmount;
      }

      return false;
    });
  }

  static isDeposit = (transaction: TransactionSplit): boolean =>
    transaction.type === TransactionTypeProperty.DEPOSIT;

  static hasACategory = (transaction: TransactionSplit): boolean =>
    !(
      transaction.category_id === undefined || transaction.category_id === null
    );

  private static convertCurrencyToFloat(amount: string): string {
    if (!amount) {
      throw new Error("Amount cannot be empty");
    }

    const isNegative = amount.includes("(") && amount.includes(")");

    const cleanAmount = amount
      .replace(/[()]/g, "")
      .replace(/[$€£¥]/g, "")
      .replace(/,/g, "")
      .trim();

    if (!/^-?\d*\.?\d+$/.test(cleanAmount)) {
      throw new Error(`Invalid amount format: ${amount}`);
    }

    const parsedAmount = parseFloat(cleanAmount);
    const finalAmount = isNegative ? -Math.abs(parsedAmount) : parsedAmount;

    return (Math.round(finalAmount * 100) / 100).toFixed(2);
  }
}
