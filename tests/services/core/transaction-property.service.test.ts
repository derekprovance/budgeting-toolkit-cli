import { TransactionSplit, TransactionTypeProperty } from "@derekprovance/firefly-iii-sdk";
import { TransactionPropertyService } from "../../../src/services/core/transaction-property.service";
import { ExpenseAccount, Tag } from "../../../src/config";
import { ExcludedTransactionService } from "../../../src/services/exluded-transaction.service";

jest.mock("../../../src/services/exluded-transaction.service");

describe("TransactionPropertyService", () => {
  describe("isTransfer", () => {
    it("should return true for transfer transactions", () => {
      const transaction = {
        type: TransactionTypeProperty.TRANSFER,
      } as TransactionSplit;

      expect(TransactionPropertyService.isTransfer(transaction)).toBe(true);
    });

    it("should return false for non-transfer transactions", () => {
      const transaction = {
        type: TransactionTypeProperty.WITHDRAWAL,
      } as TransactionSplit;

      expect(TransactionPropertyService.isTransfer(transaction)).toBe(false);
    });
  });

  describe("isABill", () => {
    it("should return true when transaction has BILLS tag", () => {
      const transaction = {
        tags: [Tag.BILLS],
      } as TransactionSplit;

      expect(TransactionPropertyService.isABill(transaction)).toBe(true);
    });

    it("should return false when transaction has no tags", () => {
      const transaction = {
        tags: null,
      } as TransactionSplit;

      expect(TransactionPropertyService.isABill(transaction)).toBe(false);
    });

    it("should return false when transaction has other tags", () => {
      const transaction = {
        tags: ["Other"],
      } as TransactionSplit;

      expect(TransactionPropertyService.isABill(transaction)).toBe(false);
    });
  });

  describe("isDisposableIncome", () => {
    it("should return true when transaction has DISPOSABLE_INCOME tag", () => {
      const transaction = {
        tags: [Tag.DISPOSABLE_INCOME],
      } as TransactionSplit;

      expect(TransactionPropertyService.isDisposableIncome(transaction)).toBe(true);
    });

    it("should return false when transaction has no tags", () => {
      const transaction = {
        tags: null,
      } as TransactionSplit;

      expect(TransactionPropertyService.isDisposableIncome(transaction)).toBe(false);
    });

    it("should return false when transaction has other tags", () => {
      const transaction = {
        tags: ["Other"],
      } as TransactionSplit;

      expect(TransactionPropertyService.isDisposableIncome(transaction)).toBe(false);
    });
  });

  describe("hasNoDestination", () => {
    it("should return true when destinationId matches NO_NAME", () => {
      expect(TransactionPropertyService.hasNoDestination(ExpenseAccount.NO_NAME)).toBe(true);
    });

    it("should return false when destinationId is different", () => {
      expect(TransactionPropertyService.hasNoDestination("other-id")).toBe(false);
    });

    it("should return false when destinationId is null", () => {
      expect(TransactionPropertyService.hasNoDestination(null)).toBe(false);
    });
  });

  describe("isSupplementedByDisposable", () => {
    it("should return true when tags include DISPOSABLE_INCOME", () => {
      expect(TransactionPropertyService.isSupplementedByDisposable([Tag.DISPOSABLE_INCOME])).toBe(true);
    });

    it("should return false when tags are empty", () => {
      expect(TransactionPropertyService.isSupplementedByDisposable([])).toBe(false);
    });

    it("should return false when tags are null", () => {
      expect(TransactionPropertyService.isSupplementedByDisposable(null)).toBe(false);
    });

    it("should return false when tags are undefined", () => {
      expect(TransactionPropertyService.isSupplementedByDisposable(undefined)).toBe(false);
    });
  });

  describe("isExcludedTransaction", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should return true when transaction matches excluded list", async () => {
      const mockExcludedTransactions = [
        { description: "Test Transaction", amount: "100.00" }
      ];

      (ExcludedTransactionService.getTransactions as jest.Mock).mockResolvedValue(mockExcludedTransactions);

      const result = await TransactionPropertyService.isExcludedTransaction(
        "Test Transaction",
        "100.00"
      );

      expect(result).toBe(true);
    });

    it("should return false when transaction doesn't match excluded list", async () => {
      const mockExcludedTransactions = [
        { description: "Different Transaction", amount: "200.00" }
      ];

      (ExcludedTransactionService.getTransactions as jest.Mock).mockResolvedValue(mockExcludedTransactions);

      const result = await TransactionPropertyService.isExcludedTransaction(
        "Test Transaction",
        "100.00"
      );

      expect(result).toBe(false);
    });

    it("should handle currency formatting in amount comparison", async () => {
      const mockExcludedTransactions = [
        { description: "Test Transaction", amount: "$1,234.56" }
      ];

      (ExcludedTransactionService.getTransactions as jest.Mock).mockResolvedValue(mockExcludedTransactions);

      const result = await TransactionPropertyService.isExcludedTransaction(
        "Test Transaction",
        "1234.56"
      );

      expect(result).toBe(true);
    });
  });

  describe("isDeposit", () => {
    it("should return true for deposit transactions", () => {
      const transaction = {
        type: TransactionTypeProperty.DEPOSIT,
      } as TransactionSplit;

      expect(TransactionPropertyService.isDeposit(transaction)).toBe(true);
    });

    it("should return false for non-deposit transactions", () => {
      const transaction = {
        type: TransactionTypeProperty.WITHDRAWAL,
      } as TransactionSplit;

      expect(TransactionPropertyService.isDeposit(transaction)).toBe(false);
    });
  });

  describe("hasACategory", () => {
    it("should return true when category_id is present", () => {
      const transaction = {
        category_id: "123",
      } as TransactionSplit;

      expect(TransactionPropertyService.hasACategory(transaction)).toBe(true);
    });

    it("should return false when category_id is undefined", () => {
      const transaction = {
        category_id: undefined,
      } as TransactionSplit;

      expect(TransactionPropertyService.hasACategory(transaction)).toBe(false);
    });

    it("should return false when category_id is null", () => {
      const transaction = {
        category_id: null,
      } as TransactionSplit;

      expect(TransactionPropertyService.hasACategory(transaction)).toBe(false);
    });
  });
}); 