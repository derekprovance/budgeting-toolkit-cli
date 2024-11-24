import {
  BudgetRead,
  Category,
  TransactionSplit,
} from "@derekprovance/firefly-iii-sdk";
import { logger } from "../logger";
import { CategoryService } from "./core/category.service";
import { TransactionService } from "./core/transaction.service";
import { BudgetService } from "./core/budget.service";
import { TransactionProperty } from "./core/transaction-property.service";
import {
  AIResponse,
  LLMTransactionProcessingService,
} from "./ai/llm-transaction-processing.service";

interface TransactionCategoryResult {
  name?: string;
  category?: string;
  budget?: string;
  updatedCategory?: string;
  updatedBudget?: string;
}

export class UpdateTransactionService {
  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService,
    private budgetService: BudgetService,
    private transactionProcessingService: LLMTransactionProcessingService
  ) {}

  async updateTransactionsByTag(
    tag: string,
    updateBudget = false
  ): Promise<TransactionCategoryResult[]> {
    try {
      const [unfilteredTransactions, categories] = await Promise.all([
        this.transactionService.getTransactionsByTag(tag),
        this.categoryService.getCategories(),
      ]);

      const transactions = unfilteredTransactions.filter(
        this.shouldCategorizeTransaction
      );

      if (!transactions.length) {
        logger.info(`No transactions found for tag: ${tag}`);
        return [];
      }

      let budgets;
      let budgetNames;
      if (updateBudget) {
        budgets = await this.budgetService.getBudgets();
        budgetNames = budgets.map((b) => b.attributes.name);
      }

      const categoryNames = categories.map((c) => c.name);
      const aiResults =
        await this.transactionProcessingService.processTransactions(
          transactions,
          categoryNames,
          budgetNames
        );

      if (aiResults.length !== transactions.length) {
        throw new Error(
          `AI categorization result count (${aiResults.length}) doesn't match transaction count (${transactions.length})`
        );
      }

      this.updateTransactionsWithAIResults(
        transactions,
        aiResults,
        categories,
        budgets
      );

      return this.mapToResults(transactions, aiResults);
    } catch (ex) {
      if (ex instanceof Error) {
        logger.error(`Unable to get transactions by tag: ${ex.message}`);
      }

      return [];
    }
  }

  private updateTransactionsWithAIResults(
    transactions: TransactionSplit[],
    aiResults: AIResponse[],
    categories: Category[],
    budgets?: BudgetRead[]
  ) {
    transactions.map(async (transaction, index) => {
      const aiResult = aiResults[index];

      let budget;
      if (budgets && this.shouldSetBudget(transaction)) {
        budget = budgets?.find(
          (budget) => budget.attributes.name === aiResult.budget
        );

        if (!budget) {
          logger.info(
            `Errant Budget Result from AI ${aiResult.budget} for transaction: ${transaction.description}`
          );
        }
      }

      const category = categories.find(
        (category) => category?.name === aiResult.category
      );

      if (!category) {
        logger.info(
          `Errant Category Result from AI ${aiResult.category} for transaction: ${transaction.description}`
        );
      }

      if (
        transaction.category_name !== category?.name ||
        transaction.budget_id != budget?.id
      ) {
        await this.transactionService.updateTransaction(
          transaction,
          category?.name,
          budget?.id
        );
      }
    });
  }

  private shouldCategorizeTransaction(transaction: TransactionSplit): boolean {
    const conditions = {
      notABill: !TransactionProperty.isABill(transaction),
      notATransfer: !TransactionProperty.isTransfer(transaction),
    };

    return conditions.notABill && conditions.notATransfer;
  }

  private shouldSetBudget(transaction: TransactionSplit): boolean {
    const conditions = {
      notABill: !TransactionProperty.isABill(transaction),
      notDisposableIncome: !TransactionProperty.isDisposableIncome(transaction),
      notAnInvestment: !TransactionProperty.isInvestmentDeposit(transaction),
    };

    return (
      conditions.notABill &&
      conditions.notAnInvestment &&
      conditions.notDisposableIncome
    );
  }

  private mapToResults(
    transactions: TransactionSplit[],
    aiResults: AIResponse[]
  ): TransactionCategoryResult[] {
    return transactions.map((transaction, index) => {
      const aiResult = aiResults[index];

      return {
        ...(this.shouldCategorizeTransaction(transaction) && {
          name: transaction.description,
          category: transaction.category_name ?? "",
          updatedCategory: aiResult.category,
        }),
        ...(this.shouldSetBudget(transaction) && {
          name: transaction.description,
          budget: transaction.budget_name ?? "",
          updatedBudget: aiResult.budget,
        }),
      };
    });
  }
}
