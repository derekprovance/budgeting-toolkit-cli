import {
    TransactionSplit,
    Category,
    BudgetRead,
} from "@derekprovance/firefly-iii-sdk";
import { TransactionService } from "./transaction.service";
import { TransactionValidatorService } from "./transaction-validator.service";
import { UserInputService } from "../user-input.service";
import { logger } from "../../logger";

export class TransactionUpdaterService {
    constructor(
        private readonly transactionService: TransactionService,
        private readonly validator: TransactionValidatorService,
        private readonly noConfirmation: boolean = false,
        private readonly dryRun: boolean = false,
    ) {}

    /**
     * Updates a transaction with new category and budget
     * @param transaction The transaction to update
     * @param aiResults The AI results for the transaction
     * @param categories Available categories
     * @param budgets Available budgets
     * @returns A promise that resolves to the updated transaction or undefined if not updated
     */
    async updateTransaction(
        transaction: TransactionSplit,
        aiResults: Record<string, { category?: string; budget?: string }>,
        categories?: Category[],
        budgets?: BudgetRead[],
    ): Promise<TransactionSplit | undefined> {
        if (!this.validator.validateTransactionData(transaction, aiResults)) {
            return undefined;
        }

        try {
            const shouldUpdateBudget =
                await this.validator.shouldSetBudget(transaction);
            const journalId = transaction.transaction_journal_id;

            if (!journalId) {
                logger.warn(
                    {
                        description: transaction.description,
                    },
                    "Transaction missing journal ID, skipping",
                );
                return undefined;
            }

            // --- Begin: Validate AI category and budget ---
            const aiCategory = aiResults[journalId]?.category;
            const aiBudget = aiResults[journalId]?.budget;

            // If a category is proposed, it must be non-empty and valid
            let category;
            if (aiCategory && aiCategory !== "") {
                category = this.getValidCategory(categories, aiCategory);
                if (!category) {
                    logger.warn(
                        {
                            transactionId: journalId,
                            description: transaction.description,
                            attemptedCategory: aiCategory,
                            validCategories: categories?.map((c) => c.name),
                        },
                        "Invalid or unrecognized category from AI, skipping transaction",
                    );
                    return undefined;
                }
            } else if (aiCategory === "") {
                logger.warn(
                    {
                        transactionId: journalId,
                        description: transaction.description,
                        attemptedCategory: aiCategory,
                    },
                    "Empty category from AI, skipping transaction",
                );
                return undefined;
            }

            // If a budget is proposed, it must be non-empty and valid
            let budget;
            if (shouldUpdateBudget && aiBudget && aiBudget !== "") {
                budget = this.getValidBudget(budgets, aiBudget);
                if (!budget) {
                    logger.warn(
                        {
                            transactionId: journalId,
                            description: transaction.description,
                            attemptedBudget: aiBudget,
                            validBudgets: budgets?.map(
                                (b) => b.attributes.name,
                            ),
                        },
                        "Invalid or unrecognized budget from AI, skipping transaction",
                    );
                    return undefined;
                }
            } else if (shouldUpdateBudget && aiBudget === "") {
                logger.warn(
                    {
                        transactionId: journalId,
                        description: transaction.description,
                        attemptedBudget: aiBudget,
                    },
                    "Empty budget from AI, skipping transaction",
                );
                return undefined;
            }
            // --- End: Validate AI category and budget ---

            if (
                !this.validator.categoryOrBudgetChanged(
                    transaction,
                    category,
                    budget,
                )
            ) {
                return undefined;
            }

            // In dry run mode, we don't need user confirmation
            if (this.dryRun) {
                logger.debug(
                    {
                        transactionId: journalId,
                        description: transaction.description,
                        proposedCategory: category?.name,
                        proposedBudget: budget?.attributes.name,
                    },
                    "Dry run - showing proposed changes",
                );
                return transaction;
            }

            const approved =
                this.noConfirmation ||
                (await UserInputService.askToUpdateTransaction(transaction, {
                    category: category?.name,
                    budget: budget?.attributes.name,
                }));

            if (!approved) {
                logger.debug(
                    "User skipped transaction update:",
                    transaction.description,
                );
                return undefined;
            }

            await this.transactionService.updateTransaction(
                transaction,
                category?.name,
                budget?.id,
            );

            logger.debug(
                "Successfully updated transaction:",
                transaction.description,
            );

            return transaction;
        } catch (error) {
            logger.error("Error processing transaction:", {
                description: transaction.description,
                error,
            });
            return undefined;
        }
    }

    /**
     * Gets a valid budget from the available budgets
     * @param budgets Available budgets
     * @param value Budget name to find
     * @returns The matching budget or undefined
     */
    private getValidBudget(
        budgets: BudgetRead[] | undefined,
        value: string | undefined,
    ): BudgetRead | undefined {
        if (!value) {
            return undefined;
        }

        return budgets?.find((b) => b.attributes.name === value);
    }

    /**
     * Gets a valid category from the available categories
     * @param categories Available categories
     * @param value Category name to find
     * @returns The matching category or undefined
     */
    private getValidCategory(
        categories: Category[] | undefined,
        value: string | undefined,
    ): Category | undefined {
        if (!value) {
            return undefined;
        }

        return categories?.find((c) => c?.name === value);
    }
}
