import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { TransactionService } from "./core/transaction.service";
import { TransactionPropertyService } from "./core/transaction-property.service";
import { logger } from "../logger";
import { DateUtils } from "../utils/date.utils";
import { expectedMonthlyPaycheck } from "../config";

/**
 * Service for calculating paycheck surplus (difference between actual and expected paychecks).
 */
export class PaycheckSurplusService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly transactionPropertyService: TransactionPropertyService
  ) {}

  /**
   * Calculates the difference between actual and expected paycheck amounts for a given month.
   *
   * @param month - The month to calculate for (1-12)
   * @param year - The year to calculate for
   * @returns The difference between actual and expected paycheck amounts
   * @throws Error if month/year is invalid or if paycheck amounts cannot be calculated
   */
  async calculatePaycheckSurplus(month: number, year: number): Promise<number> {
    try {
      const paycheckCandidates = await this.findPaychecks(month, year);
      const expectedPaycheckAmount = this.getExpectedPaycheckAmount();
      const totalPaycheckAmount =
        this.calculateTotalPaycheckAmount(paycheckCandidates);

      const surplus = totalPaycheckAmount - expectedPaycheckAmount;

      logger.debug(
        {
          month,
          year,
          expectedPaycheckAmount,
          totalPaycheckAmount,
          surplus,
          paycheckCount: paycheckCandidates.length,
        },
        "Calculated paycheck surplus"
      );

      return surplus;
    } catch (error) {
      logger.error(
        {
          month,
          year,
          error: error instanceof Error ? error.message : "Unknown error",
          type: error instanceof Error ? error.constructor.name : typeof error,
        },
        "Failed to calculate paycheck surplus"
      );
      throw error;
    }
  }

  private getExpectedPaycheckAmount(): number {
    if (!expectedMonthlyPaycheck) {
      logger.warn(
        {
          expectedMonthlyPaycheck,
        },
        "Expected monthly paycheck amount not configured"
      );
      return 0;
    }

    const amount = parseFloat(expectedMonthlyPaycheck);
    if (isNaN(amount)) {
      logger.error(
        {
          expectedMonthlyPaycheck,
        },
        "Invalid expected monthly paycheck amount"
      );
      return 0;
    }

    return amount;
  }

  private calculateTotalPaycheckAmount(paychecks: TransactionSplit[]): number {
    return paychecks.reduce((sum, paycheck) => {
      const amount = parseFloat(paycheck.amount);
      if (isNaN(amount)) {
        logger.warn("Invalid paycheck amount found", { paycheck });
        return sum;
      }
      return sum + amount;
    }, 0);
  }

  private async findPaychecks(
    month: number,
    year: number
  ): Promise<TransactionSplit[]> {
    try {
      DateUtils.validateMonthYear(month, year);
      const transactions =
        await this.transactionService.getTransactionsForMonth(month, year);

      const paycheckCandidates = transactions
        .filter((t) => this.transactionPropertyService.isDeposit(t))
        .filter((t) => this.isPaycheck(t))
        .sort((a, b) => {
          const amountA = parseFloat(a.amount);
          const amountB = parseFloat(b.amount);
          return amountB - amountA;
        });

      logger.debug(
        {
          month,
          year,
          totalTransactions: transactions.length,
          paycheckCandidates: paycheckCandidates.length,
        },
        "Found paycheck candidates"
      );

      return paycheckCandidates;
    } catch (error) {
      logger.error(
        {
          month,
          year,
          error: error instanceof Error ? error.message : "Unknown error",
          type: error instanceof Error ? error.constructor.name : typeof error,
        },
        "Failed to find paychecks"
      );
      if (error instanceof Error) {
        throw new Error(
          `Failed to find paychecks for month ${month}: ${error.message}`
        );
      }
      throw new Error(`Failed to find paychecks for month ${month}`);
    }
  }

  private isPaycheck(transaction: TransactionSplit): boolean {
    return (
      transaction.category_name === "Paycheck" &&
      transaction.source_type === "Revenue account"
    );
  }
}
