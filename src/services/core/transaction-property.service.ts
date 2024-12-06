import {
  TransactionSplit,
  TransactionTypeProperty,
} from "@derekprovance/firefly-iii-sdk";
import { Description, ExpenseAccount, Tag } from "../../config";

export class TransactionProperty {
  static isTransfer = (transaction: TransactionSplit): boolean =>
    transaction.type === TransactionTypeProperty.TRANSFER;

  static isABill = (transaction: TransactionSplit): boolean =>
    transaction.tags ? transaction.tags?.includes(Tag.BILLS) : false;

  static isDisposableIncome(transaction: TransactionSplit): boolean {
    if (!transaction.tags) {
      return false;
    }

    return transaction.tags.includes(Tag.DISPOSABLE_INCOME);
  }

  static isInvestmentDeposit = (transaction: TransactionSplit) =>
    transaction.description.includes(Description.VANGUARD_INVESTMENT);

  static hasNoDestination(destinationId: string | null) {
    return destinationId === ExpenseAccount.NO_NAME;
  }

  static isSupplementedByDisposable = (tags: string[] | null | undefined) =>
    tags?.includes(Tag.DISPOSABLE_INCOME);

  static isVanguard = (description: string): boolean =>
    description === Description.VANGUARD_INVESTMENT;

  static isDeposit = (transaction: TransactionSplit): boolean =>
    transaction.type === TransactionTypeProperty.DEPOSIT;

  static hasACategory = (transaction: TransactionSplit): boolean =>
    transaction.category_id !== undefined || transaction.category_id !== null
}
