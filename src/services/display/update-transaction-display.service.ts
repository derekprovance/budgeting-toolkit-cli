import chalk from "chalk";
import { UpdateTransactionStatusDto } from "../../types/dto/update-transaction-status.dto";
import { UpdateTransactionMode } from "../../types/enum/update-transaction-mode.enum";

export class UpdateTransactionDisplayService {
    /**
     * Formats the processing header
     */
    formatProcessingHeader(
        tag: string,
        updateMode: UpdateTransactionMode,
        dryRun?: boolean,
    ): string {
        const modeText =
            updateMode === UpdateTransactionMode.Both
                ? "categories and budgets"
                : updateMode === UpdateTransactionMode.Category
                  ? "categories"
                  : "budgets";

        const dryRunText = dryRun ? " (Dry Run)" : "";

        return [
            "\n",
            chalk.blueBright(
                `Processing transactions with tag "${tag}" for ${modeText}${dryRunText}:`,
            ),
        ].join("\n");
    }

    /**
     * Formats the tag not found message
     */
    formatTagNotFound(tag: string): string {
        return ["\n", chalk.yellow(`❌ Tag "${tag}" not found`)].join("\n");
    }

    /**
     * Formats the empty tag message
     */
    formatEmptyTag(tag: string): string {
        return [
            "\n",
            chalk.yellow(`No transactions found with tag "${tag}"`),
        ].join("\n");
    }

    /**
     * Formats the transaction updates section
     * @returns A tuple containing the formatted string and the number of updates
     */
    formatTransactionUpdates(
        results: UpdateTransactionStatusDto,
        updateMode: UpdateTransactionMode,
        dryRun?: boolean,
    ): [string, number] {
        const lines: string[] = [
            `\n${chalk.blueBright(dryRun ? "Proposed Transaction Updates:" : "Transaction Updates:")}`,
        ];
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
                            result.category || "<No Category>",
                        )} ${chalk.gray("➜")} ${chalk.green(result.updatedCategory)}`,
                    );
                }

                if (hasNewBudget) {
                    changes.push(
                        `${chalk.gray("Budget:")} ${chalk.yellow(
                            result.budget || "<No Budget>",
                        )} ${chalk.gray("➜")} ${chalk.green(result.updatedBudget)}`,
                    );
                }

                lines.push(
                    `\n${chalk.blue("📝")} ${chalk.white(
                        result.name,
                    )}:\n   ${changes.join("\n   ")}`,
                );
            }
        });

        return [lines.join("\n"), updatedCount];
    }

    /**
     * Formats the summary section
     */
    formatSummary(
        results: UpdateTransactionStatusDto,
        updatedCount: number,
        dryRun?: boolean,
    ): string {
        const lines: string[] = [];

        if (results.totalTransactions === 0) {
            lines.push(chalk.yellow("No transactions found"));
        } else {
            lines.push(
                chalk.green(
                    `${dryRun ? "Proposed" : "Successfully"} updated ${updatedCount} of ${results.totalTransactions} transactions`,
                ),
            );
        }

        return lines.join("\n");
    }

    /**
     * Formats the error message
     */
    formatError(error: unknown): string {
        return [
            "\n",
            chalk.red("❌ Error processing transactions:"),
            chalk.red(
                "   " +
                    (error instanceof Error ? error.message : String(error)),
            ),
        ].join("\n");
    }
}
