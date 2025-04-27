import { UpdateTransactionService } from "../services/update-transaction.service";
import { UpdateTransactionMode } from "../types/enum/update-transaction-mode.enum";
import chalk from "chalk";
import { UpdateTransactionStatus } from "../types/enum/update-transaction-status.enum";
import { Command } from "../types/interface/command.interface";

interface UpdateTransactionsParams {
  tag: string;
  updateMode: UpdateTransactionMode;
}

export class UpdateTransactionsCommand implements Command<void, UpdateTransactionsParams> {
  constructor(
    private readonly updateTransactionService: UpdateTransactionService
  ) {}

  async execute({ tag, updateMode }: UpdateTransactionsParams): Promise<void> {
    console.log(
      `\n${chalk.blueBright("🔄 Categorizing transactions using LLM...")}`
    );
    console.log(`${chalk.gray("Tag:")} ${chalk.cyan(tag)}`);
    console.log(`${chalk.gray("Mode:")} ${chalk.cyan(updateMode)}`);
    console.log(chalk.gray("─".repeat(50)));

    try {
      const results =
        await this.updateTransactionService.updateTransactionsByTag(
          tag,
          updateMode
        );

      if (results.status === UpdateTransactionStatus.NO_TAG) {
        console.log(
          `\n${chalk.redBright("!!!")} Tag not found: ${chalk.gray(
            tag
          )} ${chalk.redBright("!!!")}`
        );
        return;
      }

      if (results.status === UpdateTransactionStatus.EMPTY_TAG) {
        console.log(
          `\n${chalk.redBright(
            "!!!"
          )} No transactions found for tag: ${chalk.gray(
            tag
          )} ${chalk.redBright("!!!")}`
        );
        return;
      }

      let updatedCount = 0;

      console.log(`\n${chalk.blueBright("Transaction Updates:")}`);
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

          console.log(
            `\n${chalk.blue("📝")} ${chalk.white(
              result.name
            )}:\n   ${changes.join("\n   ")}`
          );
        }
      });

      console.log("\n");
      console.log(chalk.gray("─".repeat(50)));
      console.log(chalk.green("✅ Processing complete"));
      console.log(
        `   ${chalk.gray("Total transactions:")} ${chalk.white(
          results.totalTransactions
        )}`
      );
      console.log(
        `   ${chalk.gray("Updates made:")} ${chalk.white(updatedCount)}`
      );
      console.log();
    } catch (error) {
      console.log("\n");
      console.error(chalk.red("❌ Error processing transactions:"));
      console.error(
        chalk.red(
          "   " + (error instanceof Error ? error.message : String(error))
        )
      );
      throw error;
    }
  }
}
