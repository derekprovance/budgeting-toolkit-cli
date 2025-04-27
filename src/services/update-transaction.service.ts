import {
  BudgetRead,
  Category,
  TransactionSplit,
} from "@derekprovance/firefly-iii-sdk";
import { logger } from "../logger";
import { CategoryService } from "./core/category.service";
import { TransactionService } from "./core/transaction.service";
import { BudgetService } from "./core/budget.service";
import { TransactionPropertyService } from "./core/transaction-property.service";
import {
  AIResponse,
  LLMTransactionProcessingService,
} from "./ai/llm-transaction-processing.service";
import { UpdateTransactionMode } from "../types/enum/update-transaction-mode.enum";
import { UpdateTransactionStatusDto, UpdateTransactionResult } from "../types/dto/update-transaction-status.dto";
import { UpdateTransactionStatus } from "../types/enum/update-transaction-status.enum";
import { UserInputService } from "./user-input.service";
import { UpdateTransactionService as IUpdateTransactionService } from "../types/interface/update-transaction.service.interface";

export interface TransactionCategoryResult {
  name?: string;
  category?: string;
  budget?: string;
  updatedCategory?: string;
  updatedBudget?: string;
}

export class UpdateTransactionService implements IUpdateTransactionService {
  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService,
    private budgetService: BudgetService,
    private llmTransactionProcessingService: LLMTransactionProcessingService,
    private transactionPropertyService: TransactionPropertyService,
    private processTransactionsWithCategories = false,
    private noConfirmation = false
  ) {}

  async updateTransactionsByTag(
    tag: string,
    updateMode: UpdateTransactionMode
  ): Promise<UpdateTransactionStatusDto> {
    try {
      if (!(await this.transactionService.tagExists(tag))) {
        logger.debug(`Tag ${tag} does not exist`);
        return {
          status: UpdateTransactionStatus.NO_TAG,
          totalTransactions: 0,
          data: []
        };
      }

      const unfilteredTransactions =
        await this.transactionService.getTransactionsByTag(tag);

      const transactions = unfilteredTransactions.filter((t) =>
        this.shouldProcessTransaction(t)
      );

      if (!transactions.length) {
        logger.debug(`No transactions found for tag: ${tag}`);
        return {
          status: UpdateTransactionStatus.EMPTY_TAG,
          totalTransactions: 0,
          data: []
        };
      }

      let categories;
      if (updateMode !== UpdateTransactionMode.Budget) {
        categories = await this.categoryService.getCategories();
      }

      let budgets;
      if (updateMode !== UpdateTransactionMode.Category) {
        budgets = await this.budgetService.getBudgets();
      }

      const aiResults = await this.getAIResultsForTransactions(
        transactions,
        updateMode,
        categories,
        budgets
      );

      const updatedTransactions = await this.updateTransactionsWithAIResults(
        transactions,
        aiResults,
        categories,
        budgets
      );

      const resultData = await this.transformToTransactionCategoryResult(
        updatedTransactions,
        aiResults
      );

      return {
        status: UpdateTransactionStatus.HAS_RESULTS,
        data: resultData,
        totalTransactions: transactions.length,
      };
    } catch (ex) {
      if (ex instanceof Error) {
        logger.error(`Unable to get transactions by tag: ${ex.message}`);
      }

      return {
        status: UpdateTransactionStatus.PROCESSING_FAILED,
        data: [],
        totalTransactions: 0,
        error: "Unable to get transactions by tag",
      };
    }
  }

  private async getAIResultsForTransactions(
    transactions: TransactionSplit[],
    updateMode: UpdateTransactionMode,
    categories?: Category[],
    budgets?: BudgetRead[]
  ) {
    const categoryNames = categories?.map((c) => c.name);
    const budgetNames = budgets?.map((b) => b.attributes.name);

    const aiResults =
      await this.llmTransactionProcessingService.processTransactions(
        transactions,
        updateMode !== UpdateTransactionMode.Budget ? categoryNames : undefined,
        updateMode !== UpdateTransactionMode.Category ? budgetNames : undefined
      );

    if (Object.keys(aiResults).length !== transactions.length) {
      throw new Error(
        `LLM categorization result count (${
          Object.keys(aiResults).length
        }) doesn't match transaction count (${transactions.length})`
      );
    }

    return aiResults;
  }

  private async updateTransactionsWithAIResults(
    transactions: TransactionSplit[],
    aiResults: AIResponse,
    categories?: Category[],
    budgets?: BudgetRead[]
  ): Promise<TransactionSplit[]> {
    const updatedTransactions: TransactionSplit[] = [];

    for (const transaction of transactions) {
      const transactionJournalId = transaction.transaction_journal_id;

      if (!this.validateTransactionData(transaction, aiResults)) {
        continue;
      }

      try {
        const shouldUpdateBudget = await this.shouldSetBudget(transaction);

        let budget;
        if (shouldUpdateBudget) {
          budget = this.getValidBudget(
            budgets,
            aiResults[transactionJournalId!].budget
          );
        }

        const category = await this.getValidCategory(
          categories,
          aiResults[transactionJournalId!]?.category
        );

        if (!this.categoryOrBudgetChanged(transaction, category, budget)) {
          continue;
        }

        const approved =
          !this.noConfirmation &&
          (await UserInputService.askToUpdateTransaction(
            transaction,
            category?.name,
            budget?.attributes.name
          ));

        if (!approved) {
          logger.debug(
            "User skipped transaction update:",
            transaction.description
          );
          continue;
        }

        await this.transactionService.updateTransaction(
          transaction,
          category?.name,
          budget?.id
        );

        updatedTransactions.push(transaction);
        logger.debug(
          "Successfully updated transaction:",
          transaction.description
        );
      } catch (error) {
        logger.error("Error processing transaction:", {
          description: transaction.description,
          error,
        });
      }
    }

    logger.debug(
      `Processed ${transactions.length} transactions, updated ${updatedTransactions.length}`
    );
    return updatedTransactions;
  }

  private getValidBudget(
    budgets: BudgetRead[] | undefined,
    value: string | undefined
  ): BudgetRead | undefined {
    if (!value) {
      return;
    }

    return budgets?.find((b) => b.attributes.name === value);
  }

  private getValidCategory(
    categories: Category[] | undefined,
    value: string | undefined
  ): Category | undefined {
    if (!value) {
      return;
    }

    return categories?.find((c) => c?.name === value);
  }

  private validateTransactionData(
    transaction: TransactionSplit,
    aiResults: AIResponse
  ): boolean {
    const journalId = transaction.transaction_journal_id;

    if (!journalId) {
      logger.warn("Missing journal ID:", transaction.description);
      return false;
    }

    if (!aiResults[journalId]) {
      logger.warn("No AI results found:", transaction.description);
      return false;
    }

    return true;
  }

  private categoryOrBudgetChanged(
    transaction: TransactionSplit,
    category?: Category,
    budget?: BudgetRead
  ): boolean {
    const hasCategoryChange =
      category?.name && transaction.category_name !== category.name;
    const hasBudgetChange = budget?.id && transaction.budget_id !== budget.id;

    return Boolean(hasCategoryChange || hasBudgetChange);
  }

  private shouldProcessTransaction(transaction: TransactionSplit): boolean {
    const conditions = {
      notATransfer: !this.transactionPropertyService.isTransfer(transaction),
      hasACategory: this.transactionPropertyService.hasACategory(transaction),
    };

    return this.processTransactionsWithCategories
      ? conditions.notATransfer
      : conditions.notATransfer && !conditions.hasACategory;
  }

  private async shouldSetBudget(
    transaction: TransactionSplit
  ): Promise<boolean> {
    const isExcludedTransaction =
      await this.transactionPropertyService.isExcludedTransaction(
        transaction.description,
        transaction.amount
      );

    const conditions = {
      notABill: !this.transactionPropertyService.isBill(transaction),
      notDisposableIncome:
        !this.transactionPropertyService.isDisposableIncome(transaction),
      notAnExcludedTransaction: !isExcludedTransaction,
      notADeposit: !this.transactionPropertyService.isDeposit(transaction),
    };

    return (
      conditions.notABill &&
      conditions.notAnExcludedTransaction &&
      conditions.notDisposableIncome &&
      conditions.notADeposit
    );
  }

  private async transformToTransactionCategoryResult(
    transactions: TransactionSplit[],
    aiResults: AIResponse
  ): Promise<UpdateTransactionResult[]> {
    return transactions.map((transaction) => {
      const journalId = transaction.transaction_journal_id;
      const aiResult = journalId ? aiResults[journalId] : undefined;

      return {
        name: transaction.description || "",
        category: transaction.category_name,
        updatedCategory: aiResult?.category,
        budget: transaction.budget_name,
        updatedBudget: aiResult?.budget,
      };
    });
  }
}
