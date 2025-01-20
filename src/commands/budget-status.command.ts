import { BudgetStatusService } from "../services/budget-status.service";
import chalk from "chalk";

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
};

const getPercentageSpent = (spent: number, amount: number): number => {
  const percentage = Math.abs(spent) / amount;
  return percentage ? (percentage) * 100 : 0;
};

const getColorForPercentage = (
  percentage: number,
  daysLeftPercentage?: number
): chalk.Chalk => {
  if (daysLeftPercentage !== undefined) {
    // If we're over the ideal spend rate for the current month
    if (percentage > daysLeftPercentage) {
      return percentage > 100 ? chalk.red : chalk.yellow;
    }
  }

  if (percentage > 100) return chalk.red;
  if (percentage > 85) return chalk.yellow;
  return chalk.green;
};

const createProgressBar = (percentage: number, width: number = 20): string => {
  // Cap the percentage at 100% for visual purposes
  const normalizedPercentage = Math.min(percentage, 100);
  const filledWidth = Math.round((normalizedPercentage / 100) * width);
  const emptyWidth = Math.max(0, width - filledWidth);

  const bar = "█".repeat(filledWidth) + " ".repeat(emptyWidth);
  return percentage > 100
    ? `[${bar}] +${(percentage - 100).toFixed(0)}%`
    : `[${bar}]`;
};

const getDaysLeftInfo = (
  month: number,
  year: number
): {
  daysLeft: number;
  percentageLeft: number;
  currentDay: number;
  totalDays: number;
} => {
  const today = new Date();
  const lastDay = new Date(year, month, 0).getDate();
  const currentDay = today.getDate();
  const daysLeft = lastDay - currentDay;
  const percentageLeft = ((lastDay - currentDay) / lastDay) * 100;

  return {
    daysLeft,
    percentageLeft,
    currentDay,
    totalDays: lastDay,
  };
};

const getDailyRateIndicator = (
  spent: number,
  amount: number,
  currentDay: number,
  totalDays: number
): string => {
  const idealSpentByNow = (amount / totalDays) * currentDay;
  const actualSpent = Math.abs(spent);
  const difference = actualSpent - idealSpentByNow;

  if (Math.abs(difference) < 1) {
    return chalk.gray("•");
  }

  const differenceFormatted = formatCurrency(Math.abs(difference));
  if (difference > 0) {
    return chalk.redBright(`↑${differenceFormatted}`);
  } else {
    return chalk.cyanBright(`↓${differenceFormatted}`);
  }
};

//TODO(DEREK) - Use updatedOn instead of today here
export const budgetStatusCommand = async (
  budgetStatusService: BudgetStatusService,
  month: number,
  year: number
) => {
  const budgetStatuses = await budgetStatusService.getBudgetStatus(month, year);
  const isCurrentMonth =
    new Date().getMonth() + 1 === month && new Date().getFullYear() === year;

  const { daysLeft, percentageLeft, currentDay, totalDays } = isCurrentMonth
    ? getDaysLeftInfo(month, year)
    : { daysLeft: 0, percentageLeft: 0, currentDay: 0, totalDays: 0 };

  // Calculate totals
  const totalBudget = budgetStatuses.reduce(
    (sum, status) => sum + status.amount,
    0
  );
  const totalSpent = budgetStatuses.reduce(
    (sum, status) => sum + status.spent,
    0
  );
  const totalPercentage = getPercentageSpent(totalSpent, totalBudget);

  // Print header
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
        )}% of month left)\n`
      )
    );
  }

  // Print individual budget items
  const nameWidth = Math.max(
    ...budgetStatuses.map((status) => status.name.length),
    20
  );

  budgetStatuses.forEach((status) => {
    const percentage = getPercentageSpent(status.spent, status.amount);
    const color = getColorForPercentage(
      percentage,
      isCurrentMonth ? 100 - percentageLeft : undefined
    );

    const remaining = status.amount + status.spent;
    const progressBar = createProgressBar(percentage);

    // Add daily rate indicator for current month
    const dailyRateInfo = isCurrentMonth
      ? getDailyRateIndicator(
          status.spent,
          status.amount,
          currentDay,
          totalDays
        )
      : "";

    console.log(
      chalk.bold(status.name.padEnd(nameWidth)) +
        color(formatCurrency(Math.abs(status.spent)).padStart(12)) +
        " of " +
        chalk.bold(formatCurrency(status.amount).padStart(12)) +
        color(` (${percentage.toFixed(1)}%)`.padStart(8)) +
        "  " +
        color(progressBar) +
        (dailyRateInfo ? " " + dailyRateInfo : "") +
        "\n" +
        " ".repeat(nameWidth) +
        chalk.gray(`Remaining: ${formatCurrency(remaining)}`)
    );
    console.log(); // Add spacing between items
  });

  // Print summary
  console.log("─".repeat(nameWidth + 50));
  const summaryColor = getColorForPercentage(
    totalPercentage,
    isCurrentMonth ? 100 - percentageLeft : undefined
  );

  // Add daily rate indicator for total
  const totalDailyRateInfo = isCurrentMonth
    ? getDailyRateIndicator(totalSpent, totalBudget, currentDay, totalDays)
    : "";

  console.log(
    chalk.bold("TOTAL".padEnd(nameWidth)) +
      summaryColor(formatCurrency(Math.abs(totalSpent)).padStart(12)) +
      " of " +
      chalk.bold(formatCurrency(totalBudget).padStart(12)) +
      summaryColor(` (${totalPercentage.toFixed(1)}%)`.padStart(8)) +
      "  " +
      summaryColor(createProgressBar(totalPercentage)) +
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
};
