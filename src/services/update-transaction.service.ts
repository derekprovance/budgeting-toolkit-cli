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
import { UpdateTransactionStatusDto } from "../types/dto/update-transaction-status.dto";
import { UpdateTransactionStatus } from "../types/enum/update-transaction-status.enum";
import { IUpdateTransactionService } from "../types/interface/update-transaction.service.interface";
import { TransactionValidatorService } from "./core/transaction-validator.service";
import { TransactionUpdaterService } from "./core/transaction-updater.service";

export class UpdateTransactionService implements IUpdateTransactionService {
  private readonly validator: TransactionValidatorService;
  private readonly updater: TransactionUpdaterService;

  constructor(
    private readonly transactionService: TransactionService,
    private readonly categoryService: CategoryService,
    private readonly budgetService: BudgetService,
    private readonly llmTransactionProcessingService: LLMTransactionProcessingService,
    private readonly transactionPropertyService: TransactionPropertyService,
    private readonly processTransactionsWithCategories = false,
    private readonly noConfirmation = false
  ) {
    this.validator = new TransactionValidatorService(
      transactionPropertyService
    );
    this.updater = new TransactionUpdaterService(
      transactionService,
      this.validator,
      noConfirmation
    );
  }

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
          data: [],
        };
      }

      const unfilteredTransactions =
        await this.transactionService.getTransactionsByTag(tag);

      const transactions = unfilteredTransactions.filter((t) =>
        this.validator.shouldProcessTransaction(
          t,
          this.processTransactionsWithCategories
        )
      );

      if (!transactions.length) {
        logger.debug(`No transactions found for tag: ${tag}`);
        return {
          status: UpdateTransactionStatus.EMPTY_TAG,
          totalTransactions: 0,
          data: [],
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
  ): Promise<AIResponse> {
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
      const updatedTransaction = await this.updater.updateTransaction(
        transaction,
        aiResults,
        categories,
        budgets
      );

      if (updatedTransaction) {
        updatedTransactions.push(updatedTransaction);
      }
    }

    logger.debug(
      `Processed ${transactions.length} transactions, updated ${updatedTransactions.length}`
    );
    return updatedTransactions;
  }

  private async transformToTransactionCategoryResult(
    transactions: TransactionSplit[],
    aiResults: AIResponse
  ): Promise<
    Array<{
      name: string;
      category?: string;
      updatedCategory?: string;
      budget?: string;
      updatedBudget?: string;
    }>
  > {
    return transactions.map((transaction) => {
      const journalId = transaction.transaction_journal_id;
      const aiResult = journalId ? aiResults[journalId] : undefined;

      return {
        name: transaction.description || "",
        category: transaction.category_name || undefined,
        updatedCategory: aiResult?.category,
        budget: transaction.budget_name || undefined,
        updatedBudget: aiResult?.budget,
      };
    });
  }
}
