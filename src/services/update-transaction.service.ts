import {
    BudgetRead,
    Category,
    TransactionSplit,
} from "@derekprovance/firefly-iii-sdk";
import { logger } from "../logger";
import { CategoryService } from "./core/category.service";
import { TransactionService } from "./core/transaction.service";
import { BudgetService } from "./core/budget.service";
import {
    AIResponse,
    LLMTransactionProcessingService,
} from "./ai/llm-transaction-processing.service";
import { UpdateTransactionMode } from "../types/enum/update-transaction-mode.enum";
import { UpdateTransactionStatusDto } from "../types/dto/update-transaction-status.dto";
import { UpdateTransactionStatus } from "../types/enum/update-transaction-status.enum";
import { IUpdateTransactionService } from "../types/interface/update-transaction.service.interface";
import { TransactionValidatorService } from "./core/transaction-validator.service";
import { TransactionUpdaterService } from "./core/transaction-updater.service";

export class UpdateTransactionService implements IUpdateTransactionService {
    constructor(
        private readonly transactionService: TransactionService,
        private readonly transactionUpdaterService: TransactionUpdaterService,
        private readonly categoryService: CategoryService,
        private readonly budgetService: BudgetService,
        private readonly llmService: LLMTransactionProcessingService,
        private readonly validator: TransactionValidatorService,
        private readonly processTransactionsWithCategories: boolean = false,
    ) {}

    async updateTransactionsByTag(
        tag: string,
        updateMode: UpdateTransactionMode,
        dryRun?: boolean,
    ): Promise<UpdateTransactionStatusDto> {
        try {
            if (!(await this.transactionService.tagExists(tag))) {
                logger.debug(
                    {
                        tag,
                        updateMode,
                        dryRun,
                    },
                    "Tag does not exist",
                );
                return {
                    status: UpdateTransactionStatus.NO_TAG,
                };
            }

            const unfilteredTransactions =
                await this.transactionService.getTransactionsByTag(tag);

            const transactions = unfilteredTransactions.filter((t) =>
                this.validator.shouldProcessTransaction(
                    t,
                    this.processTransactionsWithCategories,
                ),
            );

            if (!transactions.length) {
                logger.debug(
                    {
                        tag,
                        updateMode,
                        dryRun,
                        totalTransactions: unfilteredTransactions.length,
                        filteredTransactions: transactions.length,
                    },
                    "No valid transactions found for tag",
                );
                return {
                    status: UpdateTransactionStatus.EMPTY_TAG,
                };
            }

            logger.debug(
                {
                    tag,
                    updateMode,
                    dryRun,
                    totalTransactions: transactions.length,
                },
                "Processing transactions",
            );

            let categories: Category[] | undefined;
            if (updateMode !== UpdateTransactionMode.Budget) {
                categories = await this.categoryService.getCategories();
            }

            let budgets: BudgetRead[] | undefined;
            if (updateMode !== UpdateTransactionMode.Category) {
                budgets = await this.budgetService.getBudgets();
            }

            const aiResults = await this.getAIResultsForTransactions(
                transactions,
                updateMode,
                categories,
                budgets,
            );

            const updatedTransactions =
                await this.updateTransactionsWithAIResults(
                    transactions,
                    aiResults,
                    dryRun,
                );

            logger.debug(
                {
                    tag,
                    updateMode,
                    dryRun,
                    totalTransactions: transactions.length,
                    updatedTransactions: updatedTransactions.length,
                    categories: categories?.length,
                    budgets: budgets?.length,
                },
                "Transaction update complete",
            );

            return {
                status: UpdateTransactionStatus.HAS_RESULTS,
            };
        } catch (ex) {
            logger.error(
                {
                    tag,
                    updateMode,
                    dryRun,
                    error: ex instanceof Error ? ex.message : "Unknown error",
                },
                "Failed to update transactions",
            );

            return {
                status: UpdateTransactionStatus.PROCESSING_FAILED,
                error:
                    ex instanceof Error
                        ? ex.message
                        : "Unknown error occurred while processing transactions",
            };
        }
    }

    private async getAIResultsForTransactions(
        transactions: TransactionSplit[],
        updateMode: UpdateTransactionMode,
        categories?: Category[],
        budgets?: BudgetRead[],
    ): Promise<AIResponse> {
        const categoryNames = categories?.map((c) => c.name);
        const budgetNames = budgets?.map((b) => b.attributes.name);

        logger.debug(
            {
                updateMode,
                transactionCount: transactions.length,
                categoryCount: categoryNames?.length,
                budgetCount: budgetNames?.length,
            },
            "Getting AI results for transactions",
        );

        const aiResults = await this.llmService.processTransactions(
            transactions,
            updateMode !== UpdateTransactionMode.Budget
                ? categoryNames
                : undefined,
            updateMode !== UpdateTransactionMode.Category
                ? budgetNames
                : undefined,
        );

        if (Object.keys(aiResults).length !== transactions.length) {
            const error = new Error(
                `LLM categorization result count (${
                    Object.keys(aiResults).length
                }) doesn't match transaction count (${transactions.length})`,
            );
            logger.error(
                {
                    expectedCount: transactions.length,
                    actualCount: Object.keys(aiResults).length,
                },
                "AI result count mismatch",
            );
            throw error;
        }

        return aiResults;
    }

    private async updateTransactionsWithAIResults(
        transactions: TransactionSplit[],
        aiResults: Record<string, { category?: string; budget?: string }>,
        dryRun?: boolean,
    ): Promise<TransactionSplit[]> {
        logger.debug(
            { count: transactions.length },
            "START updateTransactionsWithAIResults",
        );
        const results: TransactionSplit[] = [];

        try {
            for (const transaction of transactions) {
                const journalId = transaction.transaction_journal_id;
                if (!journalId) {
                    logger.debug(
                        { description: transaction.description },
                        "Transaction missing journal ID:",
                    );
                    continue;
                }

                if (!aiResults[journalId]) {
                    logger.debug(
                        { description: transaction.description },
                        "No AI results for transaction:",
                    );
                    continue;
                }

                const updatedTransaction =
                    await this.transactionUpdaterService.updateTransaction(
                        transaction,
                        aiResults,
                    );

                if (updatedTransaction) {
                    results.push(updatedTransaction);
                }
            }

            const totalTransactions = transactions.length;
            const updatedCount = results.length;
            const skippedCount = totalTransactions - updatedCount;

            logger.debug(
                {
                    totalTransactions,
                    updated: updatedCount,
                    skipped: skippedCount,
                },
                `${dryRun ?? "[DRYRUN] "} Transaction update completed`,
            );

            return results;
        } catch (err) {
            logger.error(
                { error: err instanceof Error ? err.message : err },
                "ERROR in updateTransactionsWithAIResults",
            );
            throw err;
        }
    }
}
