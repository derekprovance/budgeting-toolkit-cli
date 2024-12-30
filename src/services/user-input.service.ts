import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import chalk from "chalk";
import inquirer from "inquirer";

export class UserInputService {
  static async askToUpdateTransaction(
    transaction: TransactionSplit,
    category: string | undefined,
    budget: string | undefined,
  ): Promise<boolean> {
    const changes = [
      category &&
        category !== transaction.category_name &&
        `Category: ${chalk.redBright(
          transaction.category_name || "None"
        )} → ${chalk.cyan(category)}`,
      budget &&
        budget !== transaction.budget_name &&
        `Budget: ${chalk.redBright(
          transaction.budget_name || "None"
        )} → ${chalk.cyan(budget)}`,
    ].filter(Boolean);

    if (changes.length === 0) {
      return false;
    }

    const formattedDescription =
      transaction.description.length > 50
        ? `${transaction.description.substring(0, 47)}...`
        : transaction.description;

    const message = [
      `${chalk.bold("Transaction:")} "${chalk.yellow(formattedDescription)}"`,
      `${chalk.bold("Proposed changes:")}`,
      ...changes.map((change) => chalk.gray(`  • ${change}`)),
      `\n${chalk.bold("Apply these changes?")}`,
    ].join("\n");

    console.log("\n");
    const answer = await inquirer.prompt([
      {
        type: "confirm",
        name: "update",
        message,
        default: true,
      },
    ]);

    return answer.update;
  }
}
