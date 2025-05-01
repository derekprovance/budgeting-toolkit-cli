import { UpdateTransactionService } from "../../src/services/update-transaction.service";
import { TransactionService } from "../../src/services/core/transaction.service";
import { CategoryService } from "../../src/services/core/category.service";
import { BudgetService } from "../../src/services/core/budget.service";
import { LLMTransactionProcessingService } from "../../src/services/ai/llm-transaction-processing.service";
import { TransactionPropertyService } from "../../src/services/core/transaction-property.service";
import { TransactionValidatorService } from "../../src/services/core/transaction-validator.service";
import { TransactionUpdaterService } from "../../src/services/core/transaction-updater.service";
import { UpdateTransactionMode } from "../../src/types/enum/update-transaction-mode.enum";
import { UpdateTransactionStatus } from "../../src/types/enum/update-transaction-status.enum";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { Category } from "@derekprovance/firefly-iii-sdk";
import { BudgetRead } from "@derekprovance/firefly-iii-sdk";

// Mock the logger to prevent console output during tests
jest.mock("../../src/logger", () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  },
}));

// Mock the services
jest.mock("../../src/services/core/transaction.service");
jest.mock("../../src/services/core/category.service");
jest.mock("../../src/services/core/budget.service");
jest.mock("../../src/services/ai/llm-transaction-processing.service");
jest.mock("../../src/services/core/transaction-property.service");
jest.mock("../../src/services/core/transaction-validator.service");
jest.mock("../../src/services/core/transaction-updater.service");

describe("UpdateTransactionService", () => {
  let service: UpdateTransactionService;
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockCategoryService: jest.Mocked<CategoryService>;
  let mockBudgetService: jest.Mocked<BudgetService>;
  let mockLLMService: jest.Mocked<LLMTransactionProcessingService>;
  let mockPropertyService: jest.Mocked<TransactionPropertyService>;
  let mockValidator: jest.Mocked<TransactionValidatorService>;
  let mockUpdater: jest.Mocked<TransactionUpdaterService>;

  const mockTransactions: Partial<TransactionSplit>[] = [
    {
      transaction_journal_id: "1",
      description: "Test Transaction 1",
      amount: "100.00",
      category_name: "Old Category",
      budget_id: "1",
      budget_name: "Old Budget",
      type: "withdrawal",
      date: "2024-03-01",
      source_id: "1",
      destination_id: "2",
    },
    {
      transaction_journal_id: "2",
      description: "Test Transaction 2",
      amount: "200.00",
      category_name: "Old Category",
      budget_id: "2",
      budget_name: "Old Budget",
      type: "withdrawal",
      date: "2024-03-01",
      source_id: "1",
      destination_id: "2",
    },
  ];

  const mockCategories: Partial<Category>[] = [
    { name: "New Category 1" },
    { name: "New Category 2" },
  ];

  const mockBudgets: Partial<BudgetRead>[] = [
    { id: "1", type: "budget", attributes: { name: "New Budget 1" } },
    { id: "2", type: "budget", attributes: { name: "New Budget 2" } },
  ];

  const mockAIResults = {
    "1": { category: "New Category 1", budget: "New Budget 1" },
    "2": { category: "New Category 2", budget: "New Budget 2" },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTransactionService = {
      tagExists: jest.fn(),
      getTransactionsByTag: jest.fn(),
      updateTransaction: jest.fn(),
    } as unknown as jest.Mocked<TransactionService>;

    mockCategoryService = {
      getCategories: jest.fn(),
    } as unknown as jest.Mocked<CategoryService>;

    mockBudgetService = {
      getBudgets: jest.fn(),
    } as unknown as jest.Mocked<BudgetService>;

    mockLLMService = {
      processTransactions: jest.fn(),
    } as unknown as jest.Mocked<LLMTransactionProcessingService>;

    mockPropertyService = {
      isTransfer: jest.fn(),
      hasACategory: jest.fn(),
      isBill: jest.fn(),
      isDisposableIncome: jest.fn(),
      isExcludedTransaction: jest.fn(),
      isDeposit: jest.fn(),
    } as unknown as jest.Mocked<TransactionPropertyService>;

    mockValidator = {
      shouldProcessTransaction: jest.fn(),
      shouldSetBudget: jest.fn(),
      validateTransactionData: jest.fn(),
      categoryOrBudgetChanged: jest.fn(),
    } as unknown as jest.Mocked<TransactionValidatorService>;

    mockUpdater = {
      updateTransaction: jest.fn(),
    } as unknown as jest.Mocked<TransactionUpdaterService>;

    // Mock the services directly
    jest.spyOn(TransactionValidatorService.prototype, 'shouldProcessTransaction').mockImplementation(mockValidator.shouldProcessTransaction);
    jest.spyOn(TransactionValidatorService.prototype, 'shouldSetBudget').mockImplementation(mockValidator.shouldSetBudget);
    jest.spyOn(TransactionValidatorService.prototype, 'validateTransactionData').mockImplementation(mockValidator.validateTransactionData);
    jest.spyOn(TransactionValidatorService.prototype, 'categoryOrBudgetChanged').mockImplementation(mockValidator.categoryOrBudgetChanged);
    jest.spyOn(TransactionUpdaterService.prototype, 'updateTransaction').mockImplementation(mockUpdater.updateTransaction);

    service = new UpdateTransactionService(
      mockTransactionService,
      mockCategoryService,
      mockBudgetService,
      mockLLMService,
      mockPropertyService,
      false,
      false
    );
  });

  describe("updateTransactionsByTag", () => {
    it("should return NO_TAG status when tag does not exist", async () => {
      mockTransactionService.tagExists.mockResolvedValue(false);

      const result = await service.updateTransactionsByTag("nonexistent", UpdateTransactionMode.Both);

      expect(result.status).toBe(UpdateTransactionStatus.NO_TAG);
      expect(result.totalTransactions).toBe(0);
      expect(result.data).toEqual([]);
    });

    it("should return EMPTY_TAG status when no transactions found", async () => {
      mockTransactionService.tagExists.mockResolvedValue(true);
      mockTransactionService.getTransactionsByTag.mockResolvedValue([]);

      const result = await service.updateTransactionsByTag("empty", UpdateTransactionMode.Both);

      expect(result.status).toBe(UpdateTransactionStatus.EMPTY_TAG);
      expect(result.totalTransactions).toBe(0);
      expect(result.data).toEqual([]);
    });

    it("should process transactions and return HAS_RESULTS status", async () => {
      mockTransactionService.tagExists.mockResolvedValue(true);
      mockTransactionService.getTransactionsByTag.mockResolvedValue(mockTransactions as TransactionSplit[]);
      mockCategoryService.getCategories.mockResolvedValue(mockCategories as Category[]);
      mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
      mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
      mockValidator.shouldProcessTransaction.mockReturnValue(true);
      mockValidator.validateTransactionData.mockReturnValue(true);
      mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
      mockUpdater.updateTransaction.mockResolvedValue(mockTransactions[0] as TransactionSplit);

      const result = await service.updateTransactionsByTag("test", UpdateTransactionMode.Both);

      expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
      expect(result.totalTransactions).toBe(mockTransactions.length);
      expect(result.data).toHaveLength(mockTransactions.length);
      expect(mockUpdater.updateTransaction).toHaveBeenCalledTimes(mockTransactions.length);
    });

    it("should handle processing failures and return PROCESSING_FAILED status", async () => {
      mockTransactionService.tagExists.mockResolvedValue(true);
      mockTransactionService.getTransactionsByTag.mockRejectedValue(new Error("Processing failed"));

      const result = await service.updateTransactionsByTag("test", UpdateTransactionMode.Both);

      expect(result.status).toBe(UpdateTransactionStatus.PROCESSING_FAILED);
      expect(result.totalTransactions).toBe(0);
      expect(result.data).toEqual([]);
      expect(result.error).toBe("Unable to get transactions by tag");
    });

    it("should skip transactions that are transfers", async () => {
      mockTransactionService.tagExists.mockResolvedValue(true);
      mockTransactionService.getTransactionsByTag.mockResolvedValue(mockTransactions as TransactionSplit[]);
      mockCategoryService.getCategories.mockResolvedValue(mockCategories as Category[]);
      mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
      mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
      mockValidator.shouldProcessTransaction.mockReturnValue(false);

      const result = await service.updateTransactionsByTag("test", UpdateTransactionMode.Both);

      expect(result.status).toBe(UpdateTransactionStatus.EMPTY_TAG);
      expect(result.totalTransactions).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(mockUpdater.updateTransaction).not.toHaveBeenCalled();
    });

    it("should handle category-only update mode", async () => {
      mockTransactionService.tagExists.mockResolvedValue(true);
      mockTransactionService.getTransactionsByTag.mockResolvedValue(mockTransactions as TransactionSplit[]);
      mockCategoryService.getCategories.mockResolvedValue(mockCategories as Category[]);
      mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
      mockValidator.shouldProcessTransaction.mockReturnValue(true);
      mockValidator.validateTransactionData.mockReturnValue(true);
      mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
      mockUpdater.updateTransaction.mockResolvedValue(mockTransactions[0] as TransactionSplit);

      const result = await service.updateTransactionsByTag("test", UpdateTransactionMode.Category);

      expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
      expect(mockBudgetService.getBudgets).not.toHaveBeenCalled();
      expect(mockUpdater.updateTransaction).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        undefined
      );
    });

    it("should handle budget-only update mode", async () => {
      mockTransactionService.tagExists.mockResolvedValue(true);
      mockTransactionService.getTransactionsByTag.mockResolvedValue(mockTransactions as TransactionSplit[]);
      mockBudgetService.getBudgets.mockResolvedValue(mockBudgets as BudgetRead[]);
      mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
      mockValidator.shouldProcessTransaction.mockReturnValue(true);
      mockValidator.validateTransactionData.mockReturnValue(true);
      mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
      mockUpdater.updateTransaction.mockResolvedValue(mockTransactions[0] as TransactionSplit);

      const result = await service.updateTransactionsByTag("test", UpdateTransactionMode.Budget);

      expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
      expect(mockCategoryService.getCategories).not.toHaveBeenCalled();
      expect(mockUpdater.updateTransaction).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        undefined,
        expect.any(Array)
      );
    });
  });
}); 