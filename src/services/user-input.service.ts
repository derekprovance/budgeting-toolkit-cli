import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import chalk from "chalk";
import { expand } from "@inquirer/prompts";
import { UpdateTransactionMode } from "../types/enum/update-transaction-mode.enum";

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

    constructor(private baseUrl: string) {}

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
    ): Promise<UpdateTransactionMode> {
        if (!transaction) {
            throw new Error("Transaction cannot be null or undefined");
        }

        const changes = this.getChangeList(transaction, options);
        if (changes.length === 0) {
            return UpdateTransactionMode.Abort;
        }

        const message = this.formatUpdateMessage(
            transaction,
            transactionId,
            changes,
        );

        return this.promptUser(message, options);
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
    private async promptUser(
        message: string,
        options: TransactionUpdateOptions,
    ): Promise<UpdateTransactionMode> {
        type InquirerKey = "a" | "b" | "c" | "x";

        let choices: Array<{
            key: InquirerKey;
            name: string;
            value: UpdateTransactionMode;
        }> = [
            {
                key: "a",
                name: "Update all",
                value: UpdateTransactionMode.Both,
            },
        ];

        if (options.budget) {
            choices.push({
                key: "b",
                name: "Update only the budget",
                value: UpdateTransactionMode.Budget,
            });
        }

        if (options.category) {
            choices.push({
                key: "c",
                name: "Update only the category",
                value: UpdateTransactionMode.Category,
            });
        }

        //TODO(DEREK) - Let's add an edit option that lets you select which and then set the value

        choices.push({
            key: "x",
            name: "Abort",
            value: UpdateTransactionMode.Abort,
        });

        const answer = await expand({
            message,
            default: "a",
            choices,
        });

        return answer;
    }

    /*
     * Returns the link to show a transaction to the user
     */
    private getTransactionLink(transactionId: string | undefined) {
        return `${this.baseUrl}/transactions/show/${transactionId}`;
    }
}
