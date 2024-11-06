import {
  TransactionSplit,
  TransactionTypeProperty,
} from "@derekprovance/firefly-iii-sdk";
import { TransactionService } from "./core/transaction.service";
import { Account, Description } from "../config";

type ValidDestinationAccount = Extract<
  Account,
  | Account.PRIMARY
  | Account.CHASE_SAPPHIRE
  | Account.CHASE_AMAZON
  | Account.CITIBANK_DOUBLECASH
>;

interface IncomeFilterConfig {
  readonly validDestinationAccounts: readonly ValidDestinationAccount[];
  readonly excludedDescriptions: readonly string[];
}

export class AdditionalIncomeService {
  private static readonly CONFIG: IncomeFilterConfig = {
    validDestinationAccounts: [
      Account.PRIMARY,
      Account.CHASE_SAPPHIRE,
      Account.CHASE_AMAZON,
      Account.CITIBANK_DOUBLECASH,
    ],
    excludedDescriptions: [Description.PAYROLL],
  };

  constructor(private readonly transactionService: TransactionService) {}

  async calculateAdditionalIncome(month: number): Promise<TransactionSplit[]> {
    try {
      const transactions =
        await this.transactionService.getTransactionsForMonth(month);
      const additionalIncome = this.filterTransactions(transactions);

      return additionalIncome;
    } catch (error) {
      console.error("Error calculating additional income:", error);
      throw new Error(
        `Failed to calculate additional income for month ${month}`
      );
    }
  }

  private filterTransactions(
    transactions: TransactionSplit[]
  ): TransactionSplit[] {
    return transactions
      .filter(this.isDeposit)
      .filter(this.hasValidDestinationAccount)
      .filter(this.isNotPayroll);
  }

  private isDeposit = (transaction: TransactionSplit): boolean =>
    transaction.type === TransactionTypeProperty.DEPOSIT;

  private hasValidDestinationAccount = (
    transaction: TransactionSplit
  ): boolean =>
    transaction.destination_id != null &&
    AdditionalIncomeService.CONFIG.validDestinationAccounts.includes(
      transaction.destination_id as ValidDestinationAccount
    );

  private isNotPayroll = (transaction: TransactionSplit): boolean =>
    !AdditionalIncomeService.CONFIG.excludedDescriptions.some((desc) =>
      transaction.description.includes(desc)
    );
}
