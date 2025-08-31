import chalk from "chalk";
import { BudgetStatus } from "../../types/interface/budget-status.interface";

/**
 * Service for formatting and displaying budget information
 */
export class BudgetDisplayService {
    private static readonly PROGRESS_BAR_WIDTH = 20;

    /**
     * Formats the budget status report header
     */
    formatHeader(
        month: number,
        year: number,
        daysLeft?: number,
        percentageLeft?: number,
        lastUpdatedOn?: Date,
    ): string {
        const header = [
            "\n" +
                chalk.bold("Budget Status Report") +
                chalk.gray(
                    ` - ${new Date(year, month - 1).toLocaleString("default", {
                        month: "long",
                    })} ${year}`,
                ),
        ];

        if (
            daysLeft !== undefined &&
            percentageLeft !== undefined &&
            lastUpdatedOn
        ) {
            header.push(
                chalk.gray(
                    `${daysLeft} days remaining (${percentageLeft.toFixed(
                        1,
                    )}% of month left)`,
                ),
                chalk.gray(
                    `Last Updated: ${lastUpdatedOn.toISOString().split("T")[0]}\n`,
                ),
            );
        } else {
            header.push("");
        }

        return header.join("\n");
    }

    /**
     * Formats an individual budget item
     */
    formatBudgetItem(
        status: BudgetStatus,
        nameWidth: number,
        isCurrentMonth: boolean,
        currentDay?: number,
        totalDays?: number,
    ): string {
        const percentage = this.getPercentageSpent(status.spent, status.amount);
        const color = this.getColorForPercentage(
            percentage,
            isCurrentMonth ? 100 - (currentDay! / totalDays!) * 100 : undefined,
        );

        const remaining = status.amount + status.spent;
        const progressBar = this.createProgressBar(percentage);

        const dailyRateInfo =
            isCurrentMonth && currentDay && totalDays
                ? this.getDailyRateIndicator(
                      status.spent,
                      status.amount,
                      currentDay,
                      totalDays,
                  )
                : "";

        return (
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
    }

    /**
     * Formats the budget summary
     */
    formatSummary(
        totalSpent: number,
        totalBudget: number,
        nameWidth: number,
        isCurrentMonth: boolean,
        currentDay?: number,
        totalDays?: number,
    ): string {
        const totalPercentage = this.getPercentageSpent(
            totalSpent,
            totalBudget,
        );
        const summaryColor = this.getColorForPercentage(
            totalPercentage,
            isCurrentMonth ? 100 - (currentDay! / totalDays!) * 100 : undefined,
        );

        const totalDailyRateInfo =
            isCurrentMonth && currentDay && totalDays
                ? this.getDailyRateIndicator(
                      totalSpent,
                      totalBudget,
                      currentDay,
                      totalDays,
                  )
                : "";

        return (
            chalk.bold("TOTAL".padEnd(nameWidth)) +
            summaryColor(
                this.formatCurrency(Math.abs(totalSpent)).padStart(12),
            ) +
            " of " +
            chalk.bold(this.formatCurrency(totalBudget).padStart(12)) +
            summaryColor(` (${totalPercentage.toFixed(1)}%)`.padStart(8)) +
            "  " +
            summaryColor(this.createProgressBar(totalPercentage)) +
            (totalDailyRateInfo ? " " + totalDailyRateInfo : "")
        );
    }

    /**
     * Gets a warning message if spending rate is too high
     * @param totalPercentage The percentage of budget spent
     * @param percentageLeft The percentage of time left in the month
     * @returns Warning message if spend rate is too high, null otherwise
     */
    getSpendRateWarning(
        totalPercentage: number,
        percentageLeft: number,
    ): string | null {
        // If we've spent more of our budget (as a percentage) than the percentage of month that has passed
        if (totalPercentage > ((100 - percentageLeft) / 100) * 100) {
            return chalk.yellow(
                "\nWarning: Current spend rate is higher than ideal for this point in the month.",
            );
        }
        return null;
    }

    private getDailyRateIndicator(
        spent: number,
        amount: number,
        currentDay: number,
        totalDays: number,
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

    private createProgressBar(percentage: number): string {
        const normalizedPercentage = Math.min(percentage, 100);
        const filledWidth = Math.round(
            (normalizedPercentage / 100) *
                BudgetDisplayService.PROGRESS_BAR_WIDTH,
        );
        const emptyWidth = Math.max(
            0,
            BudgetDisplayService.PROGRESS_BAR_WIDTH - filledWidth,
        );

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
        daysLeftPercentage?: number,
    ): chalk.Chalk {
        if (daysLeftPercentage !== undefined) {
            if (percentage > daysLeftPercentage) {
                return percentage > 100 ? chalk.red : chalk.yellow;
            }
        }

        if (percentage > 100) return chalk.red;
        if (percentage > 85) return chalk.yellow;
        return chalk.green;
    }
}
