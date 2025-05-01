import {
  TransactionSplit,
  TransactionTypeProperty,
} from "@derekprovance/firefly-iii-sdk";
import { LLMTransactionProcessingService } from "../../../src/services/ai/llm-transaction-processing.service";
import { LLMTransactionCategoryService } from "../../../src/services/ai/llm-transaction-category.service";
import { LLMTransactionBudgetService } from "../../../src/services/ai/llm-transaction-budget.service";
import { mockCategories, mockBudgets } from "../../shared/test-data";

interface MockTransactionBatch {
  transactions: TransactionSplit[];
  indices: number[];
}

interface MockCategoryService {
  categorizeTransactions: jest.Mock<
    Promise<string[]>,
    [string[], TransactionSplit[]]
  >;
}

interface MockBudgetService {
  assignBudgets: jest.Mock<
    Promise<string[]>,
    [string[], TransactionSplit[], string[]]
  >;
}

describe("LLMTransactionProcessingService", () => {
  let service: LLMTransactionProcessingService;
  let mockCategoryService: MockCategoryService;
  let mockBudgetService: MockBudgetService;

  beforeEach(() => {
    mockCategoryService = {
      categorizeTransactions: jest
        .fn()
        .mockImplementation(
          (_categories: string[], transactions: TransactionSplit[]) => {
            return Promise.resolve(
              transactions.map((tx) => {
                if (tx.description.includes("Walmart Supercenter"))
                  return mockCategories.groceries;
                if (tx.description.includes("Walmart Pharmacy"))
                  return mockCategories.healthcare;
                if (tx.description.includes("Amazon Fresh")) return mockCategories.shopping;
                return mockCategories.other;
              })
            );
          }
        ),
    };

    mockBudgetService = {
      assignBudgets: jest
        .fn()
        .mockImplementation(
          (
            _budgets: string[],
            transactions: TransactionSplit[],
            categories: string[]
          ) => {
            return Promise.resolve(
              transactions.map((tx, index) => {
                // If categories are available, use both category and transaction info
                if (categories && categories[index]) {
                  const category = categories[index];
                  if (
                    category === mockCategories.groceries &&
                    tx.description.includes("Walmart")
                  )
                    return mockBudgets.food;
                  if (
                    category === mockCategories.healthcare &&
                    tx.description.includes("Pharmacy")
                  )
                    return mockBudgets.medical;
                  if (
                    category === mockCategories.shopping &&
                    tx.description.includes("Amazon")
                  )
                    return mockBudgets.shopping;
                }

                // Fallback to transaction-only logic if categories aren't available
                if (tx.description.includes("Walmart Supercenter"))
                  return mockBudgets.food;
                if (tx.description.includes("Walmart Pharmacy"))
                  return mockBudgets.medical;
                if (tx.description.includes("Amazon Fresh")) return mockBudgets.shopping;
                return mockBudgets.other;
              })
            );
          }
        ),
    };

    service = new LLMTransactionProcessingService(
      mockCategoryService as unknown as LLMTransactionCategoryService,
      mockBudgetService as unknown as LLMTransactionBudgetService
    );
  });

  describe("processTransactions", () => {
    const mockTransactions: TransactionSplit[] = [
      {
        transaction_journal_id: "1",
        description: "Walmart Supercenter",
        amount: "150.00",
        date: "2024-01-01",
        type: "withdrawal" as TransactionTypeProperty,
        source_id: "1",
        destination_id: "2",
      },
      {
        transaction_journal_id: "2",
        description: "Walmart Pharmacy",
        amount: "25.00",
        date: "2024-01-02",
        type: "withdrawal" as TransactionTypeProperty,
        source_id: "1",
        destination_id: "2",
      },
      {
        transaction_journal_id: "3",
        description: "Amazon Fresh",
        amount: "75.00",
        date: "2024-01-03",
        type: "withdrawal" as TransactionTypeProperty,
        source_id: "1",
        destination_id: "2",
      },
    ];

    const categories = ["Groceries", "Healthcare", "Shopping"];
    const budgets = ["Food", "Medical", "Shopping"];

    it("should return empty object for empty transactions", async () => {
      const result = await service.processTransactions([], categories, budgets);
      expect(result).toEqual({});
    });

    it("should process categories only when budgets not provided", async () => {
      const result = await service.processTransactions(
        mockTransactions,
        categories
      );

      expect(mockCategoryService.categorizeTransactions).toHaveBeenCalled();
      expect(mockBudgetService.assignBudgets).not.toHaveBeenCalled();
      expect(result).toEqual({
        "1": { category: "Groceries" },
        "2": { category: "Healthcare" },
        "3": { category: "Shopping" },
      });
    });

    it("should process both categories and budgets when provided", async () => {
      const result = await service.processTransactions(
        mockTransactions,
        categories,
        budgets
      );

      expect(mockCategoryService.categorizeTransactions).toHaveBeenCalled();
      expect(mockBudgetService.assignBudgets).toHaveBeenCalled();
      expect(result).toEqual({
        "1": { category: "Groceries", budget: "Food" },
        "2": { category: "Healthcare", budget: "Medical" },
        "3": { category: "Shopping", budget: "Shopping" },
      });
    });

    it("should handle errors in category processing", async () => {
      mockCategoryService.categorizeTransactions.mockRejectedValue(
        new Error("Category error")
      );

      const result = await service.processTransactions(
        mockTransactions,
        categories,
        budgets
      );

      expect(result).toEqual({
        "1": { budget: "Food" },
        "2": { budget: "Medical" },
        "3": { budget: "Shopping" },
      });
    });

    it("should handle errors in budget processing", async () => {
      mockBudgetService.assignBudgets.mockRejectedValue(
        new Error("Budget error")
      );

      const result = await service.processTransactions(
        mockTransactions,
        categories,
        budgets
      );

      expect(result).toEqual({
        "1": { category: "Groceries" },
        "2": { category: "Healthcare" },
        "3": { category: "Shopping" },
      });
    });

    it("should handle transactions with missing required fields", async () => {
      const invalidTransactions: TransactionSplit[] = [
        {
          transaction_journal_id: "1",
          description: "", // Missing description
          amount: "150.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "2",
          description: "Walmart Pharmacy",
          amount: "", // Missing amount
          date: "2024-01-02",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
      ];

      const result = await service.processTransactions(
        invalidTransactions,
        categories,
        budgets
      );

      expect(result).toEqual({
        "1": { category: "Other", budget: "Other" },
        "2": { category: "Healthcare", budget: "Medical" },
      });
    });

    it("should handle mixed success/failure in batch processing", async () => {
      const mockTransactions = [
        {
          transaction_journal_id: "1",
          description: "Grocery Store",
          amount: "100.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "2",
          description: "Pharmacy",
          amount: "50.00",
          date: "2024-01-02",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "3",
          description: "Supermarket",
          amount: "75.00",
          date: "2024-01-03",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
      ];

      const categories = ["Groceries", "Medical"];
      const budgets = ["Food", "Medical", "Shopping"];

      // Mock category service to assign specific categories
      mockCategoryService.categorizeTransactions.mockImplementation(
        (_categories: string[], transactions: TransactionSplit[]) => {
          return Promise.resolve(
            transactions.map((tx) => {
              if (
                tx.description.includes("Grocery") ||
                tx.description.includes("Supermarket")
              )
                return "Groceries";
              if (tx.description.includes("Pharmacy")) return "Medical";
              return "";
            })
          );
        }
      );

      // Mock budget service to use both transaction details and categories
      mockBudgetService.assignBudgets.mockImplementation(
        (
          _budgets: string[],
          transactions: TransactionSplit[],
          categories: string[]
        ) => {
          return Promise.resolve(
            transactions.map((tx, index) => {
              const category = categories[index];

              // Use both category and transaction details for decision
              if (
                category === "Groceries" &&
                (tx.description.includes("Grocery") ||
                  tx.description.includes("Supermarket"))
              ) {
                return "Food";
              }
              if (
                category === "Medical" &&
                tx.description.includes("Pharmacy")
              ) {
                return "Medical";
              }
              // Fallback to transaction-only logic if category doesn't match
              if (
                tx.description.includes("Grocery") ||
                tx.description.includes("Supermarket")
              ) {
                return "Food";
              }
              if (tx.description.includes("Pharmacy")) {
                return "Medical";
              }
              return "Shopping";
            })
          );
        }
      );

      const result = await service.processTransactions(
        mockTransactions,
        categories,
        budgets
      );

      expect(result).toEqual({
        "1": { category: "Groceries", budget: "Food" },
        "2": { category: "Medical", budget: "Medical" },
        "3": { category: "Groceries", budget: "Food" },
      });
    });

    it("should handle empty categories array", async () => {
      const mockTransactions = [
        {
          transaction_journal_id: "1",
          description: "Grocery Store",
          amount: "100.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "2",
          description: "Pharmacy",
          amount: "50.00",
          date: "2024-01-02",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "3",
          description: "Supermarket",
          amount: "75.00",
          date: "2024-01-03",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
      ];

      const categories: string[] = [];
      const budgets = ["Food", "Medical", "Shopping"];

      const result = await service.processTransactions(
        mockTransactions,
        categories,
        budgets
      );

      expect(result).toEqual({
        "1": {},
        "2": {},
        "3": {},
      });
    });

    it("should process categories before budgets", async () => {
      const mockTransactions = [
        {
          transaction_journal_id: "1",
          description: "Grocery Store",
          amount: "100.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
      ];

      const categories = ["Groceries"];
      const budgets = ["Food"];

      const categoryOrder: string[] = [];
      const budgetOrder: string[] = [];

      jest
        .spyOn(
          service as unknown as {
            processCategoriesWithErrorHandling: jest.Mock;
          },
          "processCategoriesWithErrorHandling"
        )
        .mockImplementation(async () => {
          categoryOrder.push("categories");
          return mockTransactions.map(() => "Groceries");
        });

      jest
        .spyOn(
          service as unknown as { processBudgetsWithErrorHandling: jest.Mock },
          "processBudgetsWithErrorHandling"
        )
        .mockImplementation(async () => {
          budgetOrder.push("budgets");
          return mockTransactions.map(() => "Food");
        });

      await service.processTransactions(mockTransactions, categories, budgets);

      expect(categoryOrder).toEqual(["categories"]);
      expect(budgetOrder).toEqual(["budgets"]);
    });

    it("should batch transactions with similar amounts but different merchants", async () => {
      const transactions: TransactionSplit[] = [
        {
          transaction_journal_id: "1",
          description: "Store A",
          amount: "100.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "2",
          description: "Store B",
          amount: "105.00",
          date: "2024-01-02",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "3",
          description: "Store C",
          amount: "200.00",
          date: "2024-01-03",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
      ];

      const batches = (
        service as unknown as {
          createTransactionBatches: (
            transactions: TransactionSplit[]
          ) => MockTransactionBatch[];
        }
      ).createTransactionBatches(transactions);

      expect(batches).toHaveLength(1);
      expect(batches[0].transactions).toHaveLength(3);
    });

    it("should batch transactions with similar dates", async () => {
      const transactions: TransactionSplit[] = [
        {
          transaction_journal_id: "1",
          description: "Store A",
          amount: "100.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "2",
          description: "Store B",
          amount: "200.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "3",
          description: "Store C",
          amount: "300.00",
          date: "2024-01-02",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
      ];

      const batches = (
        service as unknown as {
          createTransactionBatches: (
            transactions: TransactionSplit[]
          ) => MockTransactionBatch[];
        }
      ).createTransactionBatches(transactions);

      expect(batches).toHaveLength(1);
      expect(batches[0].transactions).toHaveLength(3);
    });

    it("should handle transactions with empty/invalid descriptions", () => {
      const transactions: TransactionSplit[] = [
        {
          transaction_journal_id: "1",
          description: "",
          amount: "100.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "2",
          description: "   ",
          amount: "200.00",
          date: "2024-01-02",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "3",
          description: "Valid Store",
          amount: "300.00",
          date: "2024-01-03",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
      ];

      const batches = (
        service as unknown as {
          createTransactionBatches: (
            transactions: TransactionSplit[]
          ) => MockTransactionBatch[];
        }
      ).createTransactionBatches(transactions);

      expect(batches).toHaveLength(3);
      expect(batches[0].transactions).toHaveLength(1);
      expect(batches[1].transactions).toHaveLength(1);
      expect(batches[2].transactions).toHaveLength(1);
    });
  });

  describe("createTransactionBatches", () => {
    const similarTransactions: TransactionSplit[] = [
      {
        transaction_journal_id: "1",
        description: "Walmart Supercenter",
        amount: "150.00",
        date: "2024-01-01",
        type: "withdrawal" as TransactionTypeProperty,
        source_id: "1",
        destination_id: "2",
      },
      {
        transaction_journal_id: "2",
        description: "Walmart Supercenter",
        amount: "145.00",
        date: "2024-01-02",
        type: "withdrawal" as TransactionTypeProperty,
        source_id: "1",
        destination_id: "2",
      },
      {
        transaction_journal_id: "3",
        description: "Target",
        amount: "200.00",
        date: "2024-01-03",
        type: "withdrawal" as TransactionTypeProperty,
        source_id: "1",
        destination_id: "2",
      },
    ];

    it("should create batches of similar transactions", () => {
      const batches = (
        service as unknown as {
          createTransactionBatches: (
            transactions: TransactionSplit[]
          ) => MockTransactionBatch[];
        }
      ).createTransactionBatches(similarTransactions);

      expect(batches).toHaveLength(2);
      expect(batches[0].transactions).toHaveLength(2);
      expect(batches[1].transactions).toHaveLength(1);
      expect(batches[0].indices).toEqual([0, 1]);
      expect(batches[1].indices).toEqual([2]);
    });

    it("should respect batch size limit", () => {
      const largeTransactions = Array(10).fill(similarTransactions[0]);
      const batches = (
        service as unknown as {
          createTransactionBatches: (
            transactions: TransactionSplit[]
          ) => MockTransactionBatch[];
        }
      ).createTransactionBatches(largeTransactions);

      expect(batches[0].transactions.length).toBeLessThanOrEqual(5);
    });

    it("should batch transactions with similar amounts but different merchants", () => {
      const transactions: TransactionSplit[] = [
        {
          transaction_journal_id: "1",
          description: "Store A",
          amount: "100.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "2",
          description: "Store B",
          amount: "105.00",
          date: "2024-01-02",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "3",
          description: "Store C",
          amount: "200.00",
          date: "2024-01-03",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
      ];

      const batches = (
        service as unknown as {
          createTransactionBatches: (
            transactions: TransactionSplit[]
          ) => MockTransactionBatch[];
        }
      ).createTransactionBatches(transactions);

      expect(batches).toHaveLength(1);
      expect(batches[0].transactions).toHaveLength(3);
    });

    it("should batch transactions with similar dates", () => {
      const transactions: TransactionSplit[] = [
        {
          transaction_journal_id: "1",
          description: "Store A",
          amount: "100.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "2",
          description: "Store B",
          amount: "200.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "3",
          description: "Store C",
          amount: "300.00",
          date: "2024-01-02",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
      ];

      const batches = (
        service as unknown as {
          createTransactionBatches: (
            transactions: TransactionSplit[]
          ) => MockTransactionBatch[];
        }
      ).createTransactionBatches(transactions);

      expect(batches).toHaveLength(1);
      expect(batches[0].transactions).toHaveLength(3);
    });

    it("should handle transactions with empty/invalid descriptions", () => {
      const transactions: TransactionSplit[] = [
        {
          transaction_journal_id: "1",
          description: "",
          amount: "100.00",
          date: "2024-01-01",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "2",
          description: "   ",
          amount: "200.00",
          date: "2024-01-02",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
        {
          transaction_journal_id: "3",
          description: "Valid Store",
          amount: "300.00",
          date: "2024-01-03",
          type: "withdrawal" as TransactionTypeProperty,
          source_id: "1",
          destination_id: "2",
        },
      ];

      const batches = (
        service as unknown as {
          createTransactionBatches: (
            transactions: TransactionSplit[]
          ) => MockTransactionBatch[];
        }
      ).createTransactionBatches(transactions);

      expect(batches).toHaveLength(3);
      expect(batches[0].transactions).toHaveLength(1);
      expect(batches[1].transactions).toHaveLength(1);
      expect(batches[2].transactions).toHaveLength(1);
    });
  });

  describe("calculateTransactionSimilarity", () => {
    it("should return 1.0 for identical merchants", () => {
      const tx1: TransactionSplit = {
        transaction_journal_id: "1",
        description: "Walmart",
        amount: "100.00",
        date: "2024-01-01",
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      };
      const tx2: TransactionSplit = {
        transaction_journal_id: "2",
        description: "Walmart",
        amount: "100.00",
        date: "2024-01-02",
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      };

      const similarity = (
        service as unknown as {
          calculateTransactionSimilarity: (
            tx1: TransactionSplit,
            tx2: TransactionSplit
          ) => number;
        }
      ).calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(1.0);
    });

    it("should return 0.8 for similar amounts", () => {
      const tx1: TransactionSplit = {
        transaction_journal_id: "1",
        description: "Store1",
        amount: "100.00",
        date: "2024-01-01",
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      };
      const tx2: TransactionSplit = {
        transaction_journal_id: "2",
        description: "Store2",
        amount: "110.00",
        date: "2024-01-02",
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      };

      const similarity = (
        service as unknown as {
          calculateTransactionSimilarity: (
            tx1: TransactionSplit,
            tx2: TransactionSplit
          ) => number;
        }
      ).calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(0.8);
    });

    it("should return 0.0 for dissimilar transactions", () => {
      const tx1: TransactionSplit = {
        transaction_journal_id: "1",
        description: "Store1",
        amount: "100.00",
        date: "2024-01-01",
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      };
      const tx2: TransactionSplit = {
        transaction_journal_id: "2",
        description: "Store2",
        amount: "1000.00",
        date: "2024-01-02",
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      };

      const similarity = (
        service as unknown as {
          calculateTransactionSimilarity: (
            tx1: TransactionSplit,
            tx2: TransactionSplit
          ) => number;
        }
      ).calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(0.0);
    });
  });
});
