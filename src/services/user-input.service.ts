import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import chalk from "chalk";
import inquirer from "inquirer";

/**
 * Interface for transaction update options
 */
interface TransactionUpdateOptions {
  category?: string;
  budget?: string;
}

/**
 * Service for handling user input interactions
 */
export class UserInputService {
  private static readonly MAX_DESCRIPTION_LENGTH = 50;
  private static readonly DESCRIPTION_TRUNCATE_LENGTH = 47;

  /**
   * Asks the user whether to update a transaction with new category and/or budget
   * @param transaction The transaction to potentially update
   * @param options The proposed changes to the transaction
   * @returns Promise<boolean> Whether the user approved the changes
   * @throws Error if the transaction is invalid
   */
  static async askToUpdateTransaction(
    transaction: TransactionSplit,
    options: TransactionUpdateOptions
  ): Promise<boolean> {
    if (!transaction) {
      throw new Error("Transaction cannot be null or undefined");
    }

    const changes = this.getChangeList(transaction, options);
    if (changes.length === 0) {
      return false;
    }

    const message = this.formatUpdateMessage(transaction, changes);
    return this.promptUser(message);
  }

  /**
   * Gets a list of changes to be made to the transaction
   * @private
   */
  private static getChangeList(
    transaction: TransactionSplit,
    options: TransactionUpdateOptions
  ): string[] {
    return [
      options.category &&
        options.category !== transaction.category_name &&
        this.formatChange(
          "Category",
          transaction.category_name ?? undefined,
          options.category
        ),
      options.budget &&
        options.budget !== transaction.budget_name &&
        this.formatChange(
          "Budget",
          transaction.budget_name ?? undefined,
          options.budget
        ),
    ].filter(Boolean) as string[];
  }

  /**
   * Formats a single change for display
   * @private
   */
  private static formatChange(
    field: string,
    oldValue: string | undefined,
    newValue: string
  ): string {
    return `${field}: ${chalk.redBright(oldValue || "None")} → ${chalk.cyan(
      newValue
    )}`;
  }

  /**
   * Formats the transaction description, truncating if necessary
   * @private
   */
  private static formatDescription(description: string): string {
    return description.length > this.MAX_DESCRIPTION_LENGTH
      ? `${description.substring(0, this.DESCRIPTION_TRUNCATE_LENGTH)}...`
      : description;
  }

  /**
   * Formats the complete update message
   * @private
   */
  private static formatUpdateMessage(
    transaction: TransactionSplit,
    changes: string[]
  ): string {
    return [
      `${chalk.bold("Transaction:")} "${chalk.yellow(
        this.formatDescription(transaction.description)
      )}"`,
      `${chalk.bold("Proposed changes:")}`,
      ...changes.map((change) => chalk.gray(`  • ${change}`)),
      `\n${chalk.bold("Apply these changes?")}`,
    ].join("\n");
  }

  /**
   * Prompts the user for confirmation
   * @private
   */
  private static async promptUser(message: string): Promise<boolean> {
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
