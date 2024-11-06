import {
  BudgetRead,
  Category,
  TransactionSplit,
} from "@derekprovance/firefly-iii-sdk";
import { logger } from "../logger";
import { AIResponse, AIService } from "./ai/ai.service";
import { CategoryService } from "./core/category.service";
import { TransactionService } from "./core/transaction.service";
import { BudgetService } from "./core/budget.service";
import { Description, Tag } from "../config";

interface TransactionCategoryResult {
  name: string;
  category: string;
  budget?: string;
}

export class UpdateTransactionService {
  constructor(
    private transactionService: TransactionService,
    private categoryService: CategoryService,
    private budgetService: BudgetService,
    private aiService: AIService
  ) {}

  async updateTransactionsByTag(
    tag: string,
    updateBudget = false
  ): Promise<TransactionCategoryResult[]> {
    try {
      const [transactions, categories] = await Promise.all([
        this.transactionService.getTransactionsByTag(tag),
        this.categoryService.getCategories(),
      ]);

      if (!transactions.length) {
        logger.info(`No transactions found for tag: ${tag}`);
        return [];
      }

      let budgets: BudgetRead[] = [];
      let budgetNames;
      if (updateBudget) {
        budgets = await this.budgetService.getBudgets();
        budgetNames = budgets.map((b) => b.attributes.name);
      }

      const categoryNames = categories.map((c) => c.name);

      const aiResults = await this.aiService.processTransactions(
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
        logger.error("Unable to get transactions by tag", ex.message);
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
      if (this.shouldSetBudget(transaction)) {
        budget = budgets?.find(
          (budget) => budget.attributes.name === aiResult.budget
        );
      }
      const category = categories.find(
        (category) => category?.name === aiResult.category
      );

      budgets?.find((budget) => budget.attributes.name === aiResult.budget);
      await this.transactionService.updateTransaction(
        transaction,
        category?.name,
        budget?.id
      );
    });
  }

  private shouldSetBudget(transaction: TransactionSplit): boolean {
    if (this.isABill(transaction)) {
      return false;
    }

    if (this.isDisposableIncome(transaction)) {
      return false;
    }

    if (this.isInvestmentDeposit(transaction)) {
      return false;
    }

    return true;
  }

  private isABill(transaction: TransactionSplit): boolean {
    return transaction.tags ? transaction.tags?.includes(Tag.BILLS) : false
  }

  private isDisposableIncome = (transaction: TransactionSplit) =>
    transaction.tags?.includes(Tag.DISPOSABLE_INCOME);

  private isInvestmentDeposit = (transaction: TransactionSplit) => 
    transaction.description.includes(Description.VANGUARD_INVESTMENT)

  private mapToResults(
    transactions: TransactionSplit[],
    aiResults: AIResponse[]
  ): TransactionCategoryResult[] {
    return transactions.map((transaction, index) => ({
      name: transaction.description,
      category: aiResults[index].category,
      budget: aiResults[index].budget,
    }));
  }
}
