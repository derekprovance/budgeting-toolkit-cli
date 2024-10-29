import { TransactionSplit } from "firefly-iii-sdk";
import { TransactionService } from "./transaction.service";
import { Account } from "../config";
import { PrinterService } from "./printer.service";

export class AdditionalIncomeService {
  constructor(private transactionService: TransactionService) {}

  async getAdditionalIncome(month: number): Promise<void> {
    const transactions = await this.transactionService.getTransactionsForMonth(
      month
    );
    let filteredTransactions = this.filterIncome(transactions);
    filteredTransactions = this.filterDeposits(filteredTransactions);
    filteredTransactions = this.filterAccounts(filteredTransactions);

    PrinterService.printTransactions(filteredTransactions, 'Additional Income');
  }

  private filterDeposits(transactions: TransactionSplit[]) {
    return transactions.filter((transaction) => transaction.type === "deposit");
  }

  private filterAccounts(transactions: TransactionSplit[]): TransactionSplit[] {
    return transactions.filter(
      (transaction) =>
        transaction.destination_id &&
        [
          Account.PRIMARY,
          Account.CHASE_SAPPHIRE,
          Account.CHASE_AMAZON,
          Account.CITIBANK_DOUBLECASH,
        ].includes(transaction.destination_id as Account)
    );
  }

  private filterIncome(transactions: TransactionSplit[]): TransactionSplit[] {
    return transactions.filter(
      (transaction) => !transaction.description.includes("PAYROLL")
    );
  }
}
