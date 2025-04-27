import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { LLMTransactionProcessingService } from "../../../src/services/ai/llm-transaction-processing.service";
import { LLMTransactionCategoryService } from "../../../src/services/ai/llm-transaction-category.service";
import { LLMTransactionBudgetService } from "../../../src/services/ai/llm-transaction-budget.service";

interface MockTransactionBatch {
  transactions: TransactionSplit[];
  indices: number[];
}

interface MockCategoryService {
  categorizeTransactions: jest.Mock<Promise<string[]>, [string[], TransactionSplit[]]>;
}

interface MockBudgetService {
  assignBudgets: jest.Mock<Promise<string[]>, [string[], TransactionSplit[], string[]]>;
}

describe("LLMTransactionProcessingService", () => {
  let service: LLMTransactionProcessingService;
  let mockCategoryService: MockCategoryService;
  let mockBudgetService: MockBudgetService;

  beforeEach(() => {
    mockCategoryService = {
      categorizeTransactions: jest.fn().mockImplementation((_categories: string[], transactions: TransactionSplit[]) => {
        return Promise.resolve(transactions.map((tx) => {
          if (tx.description.includes("Walmart Supercenter")) return "Groceries";
          if (tx.description.includes("Walmart Pharmacy")) return "Healthcare";
          if (tx.description.includes("Amazon Fresh")) return "Shopping";
          return "Other";
        }));
      }),
    };

    mockBudgetService = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      assignBudgets: jest.fn().mockImplementation((_budgets: string[], transactions: TransactionSplit[], _categories: string[]) => {
        return Promise.resolve(transactions.map((tx) => {
          if (tx.description.includes("Walmart Supercenter")) return "Food";
          if (tx.description.includes("Walmart Pharmacy")) return "Medical";
          if (tx.description.includes("Amazon Fresh")) return "Shopping";
          return "Other";
        }));
      }),
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
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      },
      {
        transaction_journal_id: "2",
        description: "Walmart Pharmacy",
        amount: "25.00",
        date: "2024-01-02",
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      },
      {
        transaction_journal_id: "3",
        description: "Amazon Fresh",
        amount: "75.00",
        date: "2024-01-03",
        type: "withdrawal",
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
      const result = await service.processTransactions(mockTransactions, categories);
      
      expect(mockCategoryService.categorizeTransactions).toHaveBeenCalled();
      expect(mockBudgetService.assignBudgets).not.toHaveBeenCalled();
      expect(result).toEqual({
        "1": { category: "Groceries" },
        "2": { category: "Healthcare" },
        "3": { category: "Shopping" },
      });
    });

    it("should process both categories and budgets when provided", async () => {
      const result = await service.processTransactions(mockTransactions, categories, budgets);
      
      expect(mockCategoryService.categorizeTransactions).toHaveBeenCalled();
      expect(mockBudgetService.assignBudgets).toHaveBeenCalled();
      expect(result).toEqual({
        "1": { category: "Groceries", budget: "Food" },
        "2": { category: "Healthcare", budget: "Medical" },
        "3": { category: "Shopping", budget: "Shopping" },
      });
    });

    it("should handle errors in category processing", async () => {
      mockCategoryService.categorizeTransactions.mockRejectedValue(new Error("Category error"));

      const result = await service.processTransactions(mockTransactions, categories, budgets);
      
      expect(result).toEqual({
        "1": { budget: "Food" },
        "2": { budget: "Medical" },
        "3": { budget: "Shopping" },
      });
    });

    it("should handle errors in budget processing", async () => {
      mockBudgetService.assignBudgets.mockRejectedValue(new Error("Budget error"));

      const result = await service.processTransactions(mockTransactions, categories, budgets);
      
      expect(result).toEqual({
        "1": { category: "Groceries" },
        "2": { category: "Healthcare" },
        "3": { category: "Shopping" },
      });
    });
  });

  describe("createTransactionBatches", () => {
    const similarTransactions: TransactionSplit[] = [
      {
        transaction_journal_id: "1",
        description: "Walmart Supercenter",
        amount: "150.00",
        date: "2024-01-01",
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      },
      {
        transaction_journal_id: "2",
        description: "Walmart Supercenter",
        amount: "145.00",
        date: "2024-01-02",
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      },
      {
        transaction_journal_id: "3",
        description: "Target",
        amount: "200.00",
        date: "2024-01-03",
        type: "withdrawal",
        source_id: "1",
        destination_id: "2",
      },
    ];

    it("should create batches of similar transactions", () => {
      const batches = (service as unknown as { createTransactionBatches: (transactions: TransactionSplit[]) => MockTransactionBatch[] }).createTransactionBatches(similarTransactions);
      
      expect(batches).toHaveLength(2);
      expect(batches[0].transactions).toHaveLength(2);
      expect(batches[1].transactions).toHaveLength(1);
      expect(batches[0].indices).toEqual([0, 1]);
      expect(batches[1].indices).toEqual([2]);
    });

    it("should respect batch size limit", () => {
      const largeTransactions = Array(10).fill(similarTransactions[0]);
      const batches = (service as unknown as { createTransactionBatches: (transactions: TransactionSplit[]) => MockTransactionBatch[] }).createTransactionBatches(largeTransactions);
      
      expect(batches[0].transactions.length).toBeLessThanOrEqual(5);
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

      const similarity = (service as unknown as { calculateTransactionSimilarity: (tx1: TransactionSplit, tx2: TransactionSplit) => number }).calculateTransactionSimilarity(tx1, tx2);
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

      const similarity = (service as unknown as { calculateTransactionSimilarity: (tx1: TransactionSplit, tx2: TransactionSplit) => number }).calculateTransactionSimilarity(tx1, tx2);
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

      const similarity = (service as unknown as { calculateTransactionSimilarity: (tx1: TransactionSplit, tx2: TransactionSplit) => number }).calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(0.0);
    });
  });
}); 