import { TransactionValidatorService } from "../../../src/services/core/transaction-validator.service";
import { TransactionPropertyService } from "../../../src/services/core/transaction-property.service";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";

// Mock the logger to prevent console output during tests
jest.mock("../../../src/logger", () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
  },
}));

jest.mock("../../../src/services/core/transaction-property.service");

describe("TransactionValidatorService", () => {
  let service: TransactionValidatorService;
  let mockPropertyService: jest.Mocked<TransactionPropertyService>;

  const mockTransaction: Partial<TransactionSplit> = {
    transaction_journal_id: "1",
    description: "Test Transaction",
    amount: "100.00",
    category_name: "Old Category",
    budget_id: "1",
    budget_name: "Old Budget",
  };

  beforeEach(() => {
    mockPropertyService = {
      isTransfer: jest.fn(),
      hasACategory: jest.fn(),
      isBill: jest.fn(),
      isDisposableIncome: jest.fn(),
      isExcludedTransaction: jest.fn(),
      isDeposit: jest.fn(),
    } as unknown as jest.Mocked<TransactionPropertyService>;

    service = new TransactionValidatorService(mockPropertyService);
  });

  describe("shouldProcessTransaction", () => {
    it("should return true for non-transfer transactions when processTransactionsWithCategories is true", () => {
      mockPropertyService.isTransfer.mockReturnValue(false);
      mockPropertyService.hasACategory.mockReturnValue(true);

      const result = service.shouldProcessTransaction(mockTransaction as TransactionSplit, true);

      expect(result).toBe(true);
      expect(mockPropertyService.isTransfer).toHaveBeenCalledWith(mockTransaction);
    });

    it("should return false for transfer transactions when processTransactionsWithCategories is true", () => {
      mockPropertyService.isTransfer.mockReturnValue(true);
      mockPropertyService.hasACategory.mockReturnValue(true);

      const result = service.shouldProcessTransaction(mockTransaction as TransactionSplit, true);

      expect(result).toBe(false);
      expect(mockPropertyService.isTransfer).toHaveBeenCalledWith(mockTransaction);
    });

    it("should return true for non-transfer transactions without categories when processTransactionsWithCategories is false", () => {
      mockPropertyService.isTransfer.mockReturnValue(false);
      mockPropertyService.hasACategory.mockReturnValue(false);

      const result = service.shouldProcessTransaction(mockTransaction as TransactionSplit, false);

      expect(result).toBe(true);
      expect(mockPropertyService.isTransfer).toHaveBeenCalledWith(mockTransaction);
      expect(mockPropertyService.hasACategory).toHaveBeenCalledWith(mockTransaction);
    });

    it("should return false for transactions with categories when processTransactionsWithCategories is false", () => {
      mockPropertyService.isTransfer.mockReturnValue(false);
      mockPropertyService.hasACategory.mockReturnValue(true);

      const result = service.shouldProcessTransaction(mockTransaction as TransactionSplit, false);

      expect(result).toBe(false);
      expect(mockPropertyService.isTransfer).toHaveBeenCalledWith(mockTransaction);
      expect(mockPropertyService.hasACategory).toHaveBeenCalledWith(mockTransaction);
    });
  });

  describe("shouldSetBudget", () => {
    it("should return true when all conditions are met", async () => {
      mockPropertyService.isBill.mockReturnValue(false);
      mockPropertyService.isDisposableIncome.mockReturnValue(false);
      mockPropertyService.isExcludedTransaction.mockResolvedValue(false);
      mockPropertyService.isDeposit.mockReturnValue(false);

      const result = await service.shouldSetBudget(mockTransaction as TransactionSplit);

      expect(result).toBe(true);
      expect(mockPropertyService.isBill).toHaveBeenCalledWith(mockTransaction);
      expect(mockPropertyService.isDisposableIncome).toHaveBeenCalledWith(mockTransaction);
      expect(mockPropertyService.isExcludedTransaction).toHaveBeenCalledWith(mockTransaction.description, mockTransaction.amount);
      expect(mockPropertyService.isDeposit).toHaveBeenCalledWith(mockTransaction);
    });

    it("should return false when transaction is a bill", async () => {
      mockPropertyService.isBill.mockReturnValue(true);
      mockPropertyService.isDisposableIncome.mockReturnValue(false);
      mockPropertyService.isExcludedTransaction.mockResolvedValue(false);
      mockPropertyService.isDeposit.mockReturnValue(false);

      const result = await service.shouldSetBudget(mockTransaction as TransactionSplit);

      expect(result).toBe(false);
    });

    it("should return false when transaction is disposable income", async () => {
      mockPropertyService.isBill.mockReturnValue(false);
      mockPropertyService.isDisposableIncome.mockReturnValue(true);
      mockPropertyService.isExcludedTransaction.mockResolvedValue(false);
      mockPropertyService.isDeposit.mockReturnValue(false);

      const result = await service.shouldSetBudget(mockTransaction as TransactionSplit);

      expect(result).toBe(false);
    });

    it("should return false when transaction is excluded", async () => {
      mockPropertyService.isBill.mockReturnValue(false);
      mockPropertyService.isDisposableIncome.mockReturnValue(false);
      mockPropertyService.isExcludedTransaction.mockResolvedValue(true);
      mockPropertyService.isDeposit.mockReturnValue(false);

      const result = await service.shouldSetBudget(mockTransaction as TransactionSplit);

      expect(result).toBe(false);
    });

    it("should return false when transaction is a deposit", async () => {
      mockPropertyService.isBill.mockReturnValue(false);
      mockPropertyService.isDisposableIncome.mockReturnValue(false);
      mockPropertyService.isExcludedTransaction.mockResolvedValue(false);
      mockPropertyService.isDeposit.mockReturnValue(true);

      const result = await service.shouldSetBudget(mockTransaction as TransactionSplit);

      expect(result).toBe(false);
    });
  });

  describe("validateTransactionData", () => {
    const mockAIResults = {
      "1": { category: "New Category", budget: "New Budget" },
    };

    it("should return true for valid transaction data", () => {
      const result = service.validateTransactionData(mockTransaction as TransactionSplit, mockAIResults);

      expect(result).toBe(true);
    });

    it("should return false when transaction has no journal ID", () => {
      const invalidTransaction = { ...mockTransaction, transaction_journal_id: undefined };

      const result = service.validateTransactionData(invalidTransaction as TransactionSplit, mockAIResults);

      expect(result).toBe(false);
    });

    it("should return false when AI results do not contain transaction data", () => {
      const result = service.validateTransactionData(mockTransaction as TransactionSplit, {});

      expect(result).toBe(false);
    });
  });

  describe("categoryOrBudgetChanged", () => {
    it("should return true when category has changed", () => {
      const category = { name: "New Category" };
      const budget = { id: "1" };

      const result = service.categoryOrBudgetChanged(mockTransaction as TransactionSplit, category, budget);

      expect(result).toBe(true);
    });

    it("should return true when budget has changed", () => {
      const category = { name: "Old Category" };
      const budget = { id: "2" };

      const result = service.categoryOrBudgetChanged(mockTransaction as TransactionSplit, category, budget);

      expect(result).toBe(true);
    });

    it("should return false when neither category nor budget has changed", () => {
      const category = { name: "Old Category" };
      const budget = { id: "1" };

      const result = service.categoryOrBudgetChanged(mockTransaction as TransactionSplit, category, budget);

      expect(result).toBe(false);
    });

    it("should return false when category and budget are undefined", () => {
      const result = service.categoryOrBudgetChanged(mockTransaction as TransactionSplit);

      expect(result).toBe(false);
    });
  });
}); 