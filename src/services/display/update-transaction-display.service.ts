import chalk from "chalk";
import { UpdateTransactionStatusDto } from "../../types/dto/update-transaction-status.dto";
import { UpdateTransactionMode } from "../../types/enum/update-transaction-mode.enum";

export class UpdateTransactionDisplayService {
  /**
   * Formats the processing header
   */
  formatProcessingHeader(tag: string, updateMode: UpdateTransactionMode): string {
    return [
      `\n${chalk.blueBright("🔄 Categorizing transactions using LLM...")}`,
      `${chalk.gray("Tag:")} ${chalk.cyan(tag)}`,
      `${chalk.gray("Mode:")} ${chalk.cyan(updateMode)}`,
      chalk.gray("─".repeat(50))
    ].join("\n");
  }

  /**
   * Formats the error message for tag not found
   */
  formatTagNotFound(tag: string): string {
    return `\n${chalk.redBright("!!!")} Tag not found: ${chalk.gray(tag)} ${chalk.redBright("!!!")}`;
  }

  /**
   * Formats the error message for empty tag
   */
  formatEmptyTag(tag: string): string {
    return `\n${chalk.redBright("!!!")} No transactions found for tag: ${chalk.gray(tag)} ${chalk.redBright("!!!")}`;
  }

  /**
   * Formats the transaction updates section
   * @returns A tuple containing the formatted string and the number of updates
   */
  formatTransactionUpdates(results: UpdateTransactionStatusDto, updateMode: UpdateTransactionMode): [string, number] {
    const lines: string[] = [`\n${chalk.blueBright("Transaction Updates:")}`];
    let updatedCount = 0;

    results.data?.forEach((result) => {
      const hasNewCategory =
        updateMode !== UpdateTransactionMode.Budget &&
        result.category !== result.updatedCategory;
      const hasNewBudget =
        updateMode !== UpdateTransactionMode.Category &&
        result.budget !== result.updatedBudget;

      if (hasNewCategory || hasNewBudget) {
        updatedCount++;
        const changes = [];

        if (hasNewCategory) {
          changes.push(
            `${chalk.gray("Category:")} ${chalk.yellow(
              result.category || "<No Category>"
            )} ${chalk.gray("➜")} ${chalk.green(result.updatedCategory)}`
          );
        }

        if (hasNewBudget) {
          changes.push(
            `${chalk.gray("Budget:")} ${chalk.yellow(
              result.budget || "<No Budget>"
            )} ${chalk.gray("➜")} ${chalk.green(result.updatedBudget)}`
          );
        }

        lines.push(
          `\n${chalk.blue("📝")} ${chalk.white(result.name)}:\n   ${changes.join("\n   ")}`
        );
      }
    });

    return [lines.join("\n"), updatedCount];
  }

  /**
   * Formats the summary section
   */
  formatSummary(results: UpdateTransactionStatusDto, updatedCount: number): string {
    return [
      "\n",
      chalk.gray("─".repeat(50)),
      chalk.green("✅ Processing complete"),
      `   ${chalk.gray("Total transactions:")} ${chalk.white(results.totalTransactions)}`,
      `   ${chalk.gray("Updates made:")} ${chalk.white(updatedCount)}`,
      ""
    ].join("\n");
  }

  /**
   * Formats the error message
   */
  formatError(error: unknown): string {
    return [
      "\n",
      chalk.red("❌ Error processing transactions:"),
      chalk.red("   " + (error instanceof Error ? error.message : String(error)))
    ].join("\n");
  }
} 