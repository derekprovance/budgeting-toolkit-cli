import {
  TransactionSplit,
  TransactionTypeProperty,
} from "@derekprovance/firefly-iii-sdk";
import {
  ExpenseAccount,
  monthlyInvestment,
  Tag,
} from "../../config";

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
    transaction.description.includes(monthlyInvestment.description);

  static hasNoDestination(destinationId: string | null) {
    return destinationId === ExpenseAccount.NO_NAME;
  }

  static isSupplementedByDisposable = (tags: string[] | null | undefined) =>
    tags?.includes(Tag.DISPOSABLE_INCOME);

  static isMonthlyInvestment = (
    description: string,
    amount: string
  ): boolean => {
    if(!monthlyInvestment.amount) {
      return false;
    }

    return (
      monthlyInvestment.description === description &&
      this.convertCurrencyToFloat(amount) ===
        this.convertCurrencyToFloat(monthlyInvestment.amount)
    );
  };

  static isDeposit = (transaction: TransactionSplit): boolean =>
    transaction.type === TransactionTypeProperty.DEPOSIT;

  static hasACategory = (transaction: TransactionSplit): boolean =>
    !(
      transaction.category_id === undefined || transaction.category_id === null
    );

  private static convertCurrencyToFloat(amount: string): number {
    const cleanAmount = amount.replace(/[$,]+/g, "");
    return parseFloat(cleanAmount);
  }
}
