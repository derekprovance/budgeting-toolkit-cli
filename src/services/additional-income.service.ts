import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { TransactionService } from "./core/transaction.service";
import { Account, Description } from "../config";
import { TransactionPropertyService } from "./core/transaction-property.service";
import { logger } from "../logger";

type ValidDestinationAccount = Extract<
  Account,
  | Account.PRIMARY
  | Account.CHASE_SAPPHIRE
  | Account.CHASE_AMAZON
  | Account.CITIBANK_DOUBLECASH
>;

interface AdditionalIncomeConfig {
  validDestinationAccounts: readonly ValidDestinationAccount[];
  excludedDescriptions: readonly string[];
  excludeDisposableIncome: boolean;
  minTransactionAmount?: number;
}

export class AdditionalIncomeService {
  private static readonly DEFAULT_CONFIG: AdditionalIncomeConfig = {
    validDestinationAccounts: [
      Account.PRIMARY,
      Account.CHASE_SAPPHIRE,
      Account.CHASE_AMAZON,
      Account.CITIBANK_DOUBLECASH,
    ],
    excludedDescriptions: [
      Description.PAYROLL,
    ],
    excludeDisposableIncome: true,
    minTransactionAmount: 0,
  };

  private readonly config: AdditionalIncomeConfig;

  constructor(
    private readonly transactionService: TransactionService,
    private readonly transactionPropertyService: TransactionPropertyService,
    config: Partial<AdditionalIncomeConfig> = {}
  ) {
    this.config = {
      ...AdditionalIncomeService.DEFAULT_CONFIG,
      ...config,
    };
    this.validateConfig();
  }

  async calculateAdditionalIncome(
    month: number,
    year: number
  ): Promise<TransactionSplit[]> {
    try {
      this.validateInput(month, year);
      const transactions =
        await this.transactionService.getTransactionsForMonth(month, year);
      
      if (!transactions?.length) {
        logger.debug(`No transactions found for month ${month}, year ${year}`);
        return [];
      }

      const additionalIncome = this.filterTransactions(transactions);
      
      if (!additionalIncome.length) {
        logger.debug(`No additional income found for month ${month}, year ${year}`);
      }

      return additionalIncome;
    } catch (error) {
      logger.trace(error, "Error calculating additional income", {
        month,
        year,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      if (error instanceof Error) {
        throw new Error(
          `Failed to calculate additional income for month ${month}: ${error.message}`
        );
      }
      throw new Error(
        `Failed to calculate additional income for month ${month}`
      );
    }
  }

  private validateConfig(): void {
    if (!this.config.validDestinationAccounts.length) {
      throw new Error("At least one valid destination account must be specified");
    }

    if (!this.config.excludedDescriptions.length) {
      logger.warn("No excluded descriptions specified - all deposits will be considered additional income");
    }

    if (this.config.minTransactionAmount !== undefined && this.config.minTransactionAmount < 0) {
      throw new Error("Minimum transaction amount cannot be negative");
    }
  }

  private validateInput(month: number, year: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error("Month must be an integer between 1 and 12");
    }
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      throw new Error("Year must be a valid 4-digit year");
    }
  }

  private filterTransactions(
    transactions: TransactionSplit[]
  ): TransactionSplit[] {
    return transactions
      .filter((t) => this.transactionPropertyService.isDeposit(t))
      .filter(this.hasValidDestinationAccount)
      .filter(this.isNotPayroll)
      .filter(this.meetsMinimumAmount)
      .filter((t) => 
        !this.config.excludeDisposableIncome || 
        !this.transactionPropertyService.isDisposableIncome(t)
      );
  }

  private hasValidDestinationAccount = (
    transaction: TransactionSplit
  ): boolean =>
    transaction.destination_id != null &&
    this.config.validDestinationAccounts.includes(
      transaction.destination_id as ValidDestinationAccount
    );

  private isNotPayroll = (transaction: TransactionSplit): boolean => {
    if (!transaction.description) {
      logger.warn("Transaction found with no description", { transaction });
      return true; // Consider non-described transactions as non-payroll
    }

    const normalizedDescription = this.normalizeString(transaction.description);
    return !this.config.excludedDescriptions.some((desc) =>
      normalizedDescription.includes(this.normalizeString(desc))
    );
  };

  private meetsMinimumAmount = (transaction: TransactionSplit): boolean => {
    if (!this.config.minTransactionAmount) {
      return true;
    }

    const amount = parseFloat(transaction.amount);
    return !isNaN(amount) && amount >= this.config.minTransactionAmount;
  };

  private normalizeString(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[-_\s]+/g, ' ') // Replace multiple spaces, hyphens, underscores with single space
      .replace(/[^\w\s]/g, ''); // Remove all other special characters
  }
}
