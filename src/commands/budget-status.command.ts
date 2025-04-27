import { BudgetStatusService } from "../services/budget-status.service";
import chalk from "chalk";
import { TransactionService } from "../services/core/transaction.service";
import { Command } from "../types/interface/command.interface";
import { BudgetDateParams } from "../types/interface/budget-date-params.interface";

export class BudgetStatusCommand implements Command<void, BudgetDateParams> {
  constructor(
    private readonly budgetStatusService: BudgetStatusService,
    private readonly transactionService: TransactionService
  ) {}

  async execute({ month, year }: BudgetDateParams): Promise<void> {
    const budgetStatuses = await this.budgetStatusService.getBudgetStatus(
      month,
      year
    );
    const lastUpdatedOn =
      (await this.transactionService.getMostRecentTransactionDate()) ||
      new Date();
    const isCurrentMonth =
      new Date().getMonth() + 1 === month && new Date().getFullYear() === year;

    const { daysLeft, percentageLeft, currentDay, totalDays } = isCurrentMonth
      ? this.getDaysLeftInfo(month, year, lastUpdatedOn)
      : { daysLeft: 0, percentageLeft: 0, currentDay: 0, totalDays: 0 };

    const totalBudget = budgetStatuses.reduce(
      (sum, status) => sum + status.amount,
      0
    );
    const totalSpent = budgetStatuses.reduce(
      (sum, status) => sum + status.spent,
      0
    );
    const totalPercentage = this.getPercentageSpent(totalSpent, totalBudget);

    console.log(
      "\n" +
        chalk.bold("Budget Status Report") +
        chalk.gray(
          ` - ${new Date(year, month - 1).toLocaleString("default", {
            month: "long",
          })} ${year}`
        )
    );
    if (isCurrentMonth) {
      console.log(
        chalk.gray(
          `${daysLeft} days remaining (${percentageLeft.toFixed(
            1
          )}% of month left)`
        )
      );
      console.log(
        chalk.gray(
          `Last Updated: ${lastUpdatedOn.toISOString().split("T")[0]}\n`
        )
      );
    } else {
      console.log();
    }

    // Print individual budget items
    const nameWidth = Math.max(
      ...budgetStatuses.map((status) => status.name.length),
      20
    );

    budgetStatuses.forEach((status) => {
      const percentage = this.getPercentageSpent(status.spent, status.amount);
      const color = this.getColorForPercentage(
        percentage,
        isCurrentMonth ? 100 - percentageLeft : undefined
      );

      const remaining = status.amount + status.spent;
      const progressBar = this.createProgressBar(percentage);

      // Add daily rate indicator for current month
      const dailyRateInfo = isCurrentMonth
        ? this.getDailyRateIndicator(
            status.spent,
            status.amount,
            currentDay,
            totalDays
          )
        : "";

      console.log(
        chalk.bold(status.name.padEnd(nameWidth)) +
          color(this.formatCurrency(Math.abs(status.spent)).padStart(12)) +
          " of " +
          chalk.bold(this.formatCurrency(status.amount).padStart(12)) +
          color(` (${percentage.toFixed(1)}%)`.padStart(8)) +
          "  " +
          color(progressBar) +
          (dailyRateInfo ? " " + dailyRateInfo : "") +
          "\n" +
          " ".repeat(nameWidth) +
          chalk.gray(`Remaining: ${this.formatCurrency(remaining)}`)
      );
      console.log();
    });

    // Print summary
    console.log("─".repeat(nameWidth + 50));
    const summaryColor = this.getColorForPercentage(
      totalPercentage,
      isCurrentMonth ? 100 - percentageLeft : undefined
    );

    // Add daily rate indicator for total
    const totalDailyRateInfo = isCurrentMonth
      ? this.getDailyRateIndicator(
          totalSpent,
          totalBudget,
          currentDay,
          totalDays
        )
      : "";

    console.log(
      chalk.bold("TOTAL".padEnd(nameWidth)) +
        summaryColor(this.formatCurrency(Math.abs(totalSpent)).padStart(12)) +
        " of " +
        chalk.bold(this.formatCurrency(totalBudget).padStart(12)) +
        summaryColor(` (${totalPercentage.toFixed(1)}%)`.padStart(8)) +
        "  " +
        summaryColor(this.createProgressBar(totalPercentage)) +
        (totalDailyRateInfo ? " " + totalDailyRateInfo : "")
    );

    // Print spend rate warning for current month if necessary
    if (isCurrentMonth && totalPercentage > 100 - percentageLeft) {
      console.log(
        chalk.yellow(
          "\nWarning: Current spend rate is higher than ideal for this point in the month."
        )
      );
    }
  }

  private getDailyRateIndicator(
    spent: number,
    amount: number,
    currentDay: number,
    totalDays: number
  ): string {
    const idealSpentByNow = (amount / totalDays) * currentDay;
    const actualSpent = Math.abs(spent);
    const difference = actualSpent - idealSpentByNow;

    if (Math.abs(difference) < 1) {
      return chalk.gray("•");
    }

    const differenceFormatted = this.formatCurrency(Math.abs(difference));
    if (difference > 0) {
      return chalk.redBright(`↓${differenceFormatted}`);
    } else {
      return chalk.cyanBright(`↑${differenceFormatted}`);
    }
  }

  private getDaysLeftInfo(month: number, year: number, lastUpdatedOn: Date) {
    const lastDay = new Date(year, month, 0).getDate();
    const currentDay = lastUpdatedOn.getDate();
    const daysLeft = lastDay - currentDay;
    const percentageLeft = ((lastDay - currentDay) / lastDay) * 100;

    return {
      daysLeft,
      percentageLeft,
      currentDay,
      totalDays: lastDay,
    };
  }

  private createProgressBar(percentage: number, width: number = 20): string {
    // Cap the percentage at 100% for visual purposes
    const normalizedPercentage = Math.min(percentage, 100);
    const filledWidth = Math.round((normalizedPercentage / 100) * width);
    const emptyWidth = Math.max(0, width - filledWidth);

    const bar = "█".repeat(filledWidth) + " ".repeat(emptyWidth);
    return percentage > 100
      ? `[${bar}] +${(percentage - 100).toFixed(0)}%`
      : `[${bar}]`;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  }

  private getPercentageSpent(spent: number, amount: number): number {
    const percentage = Math.abs(spent) / amount;
    return percentage ? percentage * 100 : 0;
  }

  private getColorForPercentage(
    percentage: number,
    daysLeftPercentage?: number
  ): chalk.Chalk {
    if (daysLeftPercentage !== undefined) {
      // If we're over the ideal spend rate for the current month
      if (percentage > daysLeftPercentage) {
        return percentage > 100 ? chalk.red : chalk.yellow;
      }
    }

    if (percentage > 100) return chalk.red;
    if (percentage > 85) return chalk.yellow;
    return chalk.green;
  }
}
