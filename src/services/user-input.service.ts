import {
    ApiClientConfig,
    TransactionSplit,
} from "@derekprovance/firefly-iii-sdk";
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
    private readonly MAX_DESCRIPTION_LENGTH = 50;
    private readonly DESCRIPTION_TRUNCATE_LENGTH = 47;

    constructor(private config: ApiClientConfig) {}

    /**
     * Asks the user whether to update a transaction with new category and/or budget
     * @param transaction The transaction to potentially update
     * @param options The proposed changes to the transaction
     * @returns Promise<boolean> Whether the user approved the changes
     * @throws Error if the transaction is invalid
     */
    async askToUpdateTransaction(
        transaction: TransactionSplit,
        transactionId: string | undefined,
        options: TransactionUpdateOptions,
    ): Promise<boolean> {
        if (!transaction) {
            throw new Error("Transaction cannot be null or undefined");
        }

        const changes = this.getChangeList(transaction, options);
        if (changes.length === 0) {
            return false;
        }

        const message = this.formatUpdateMessage(
            transaction,
            transactionId,
            changes,
        );
        return this.promptUser(message);
    }

    /**
     * Gets a list of changes to be made to the transaction
     */
    private getChangeList(
        transaction: TransactionSplit,
        options: TransactionUpdateOptions,
    ): string[] {
        return [
            options.category &&
                options.category !== transaction.category_name &&
                this.formatChange(
                    "Category",
                    transaction.category_name ?? undefined,
                    options.category,
                ),
            options.budget &&
                options.budget !== transaction.budget_name &&
                this.formatChange(
                    "Budget",
                    transaction.budget_name ?? undefined,
                    options.budget,
                ),
        ].filter(Boolean) as string[];
    }

    /**
     * Formats a single change for display
     */
    private formatChange(
        field: string,
        oldValue: string | undefined,
        newValue: string,
    ): string {
        return `${field}: ${chalk.redBright(oldValue || "None")} → ${chalk.cyan(
            newValue,
        )}`;
    }

    /**
     * Formats the transaction description, truncating if necessary
     */
    //TODO(DEREK) - Looks like the base url has /api/v1 in it, which is problematic
    private formatDescription(
        description: string,
        transactionId: string | undefined,
    ): string {
        let truncatedDescription =
            description.length > this.MAX_DESCRIPTION_LENGTH
                ? `${description.substring(0, this.DESCRIPTION_TRUNCATE_LENGTH)}...`
                : description;

        return transactionId
            ? `\x1B]8;;${this.getTransactionLink(transactionId)}\x1B\\${truncatedDescription}\x1B]8;;\x1B\\`
            : truncatedDescription;
    }

    /**
     * Formats the complete update message
     */
    private formatUpdateMessage(
        transaction: TransactionSplit,
        transactionId: string | undefined,
        changes: string[],
    ): string {
        return [
            `${chalk.bold("Transaction:")} "${chalk.yellow(
                this.formatDescription(transaction.description, transactionId),
            )}"`,
            `${chalk.bold("Proposed changes:")}`,
            ...changes.map((change) => chalk.gray(`  • ${change}`)),
            `\n${chalk.bold("Apply these changes?")}`,
        ].join("\n");
    }

    /**
     * Prompts the user for confirmation
     */
    //TODO(DEREK) - Let's update this to ask to change the category, description, update both, quit. In other words, use the question
    private async promptUser(message: string): Promise<boolean> {
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

    /*
     * Returns the link to show a transaction to the user
     */
    private getTransactionLink(transactionId: string | undefined) {
        return `${this.config.baseUrl}/transactions/show/${transactionId}`;
    }
}
