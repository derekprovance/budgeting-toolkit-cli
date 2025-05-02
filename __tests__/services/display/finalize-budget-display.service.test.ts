jest.mock("chalk", () => {
  const mockChalk = (text: string) => text;
  mockChalk.bold = mockChalk;
  mockChalk.cyan = mockChalk;
  mockChalk.dim = mockChalk;
  mockChalk.white = mockChalk;
  mockChalk.yellow = mockChalk;
  mockChalk.redBright = mockChalk;
  mockChalk.yellowBright = mockChalk;
  mockChalk.greenBright = mockChalk;
  mockChalk.gray = mockChalk;
  mockChalk.cyanBright = mockChalk;
  mockChalk.red = mockChalk;
  return mockChalk;
});

import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { FinalizeBudgetDisplayService } from "../../../src/services/display/finalize-budget-display.service";
import { TransactionPropertyService } from "../../../src/services/core/transaction-property.service";
import { ExcludedTransactionService } from "../../../src/services/excluded-transaction.service";

jest.mock("../../../src/services/core/transaction-property.service");
jest.mock("../../../src/services/excluded-transaction.service");

describe("FinalizeBudgetDisplayService", () => {
  let service: FinalizeBudgetDisplayService;
  let transactionPropertyService: jest.Mocked<TransactionPropertyService>;
  let excludedTransactionService: jest.Mocked<ExcludedTransactionService>;

  const mockTransaction: Partial<TransactionSplit> = {
    description: "Test Transaction",
    amount: "100.00",
    date: "2024-05-15",
    currency_symbol: "$",
    category_name: "Test Category",
  };

  beforeEach(() => {
    excludedTransactionService = new ExcludedTransactionService() as jest.Mocked<ExcludedTransactionService>;
    transactionPropertyService = new TransactionPropertyService(excludedTransactionService) as jest.Mocked<TransactionPropertyService>;
    service = new FinalizeBudgetDisplayService(transactionPropertyService);
  });

  describe("formatHeader", () => {
    it("should format header correctly", () => {
      const result = service.formatHeader("Test Header");
      expect(result).toContain("Test Header");
      expect(result).toContain("╔");
      expect(result).toContain("╗");
      expect(result).toContain("╚");
      expect(result).toContain("╝");
    });
  });

  describe("formatMonthHeader", () => {
    it("should format month header correctly", () => {
      const result = service.formatMonthHeader(5, 2024);
      expect(result).toContain("Budget Report for May 2024");
    });
  });

  describe("formatAdditionalIncomeSection", () => {
    it("should format empty additional income section", () => {
      const result = service.formatAdditionalIncomeSection([]);
      expect(result).toContain("=== Additional Income ===");
      expect(result).toContain("No additional income transactions found");
    });

    it("should format additional income section with transactions", () => {
      const result = service.formatAdditionalIncomeSection([
        mockTransaction as TransactionSplit,
      ]);
      expect(result).toContain("=== Additional Income ===");
      expect(result).toContain("Test Transaction");
      expect(result).toContain("$100.00");
      expect(result).toContain("Total Additional Income");
    });
  });

  describe("formatUnbudgetedExpensesSection", () => {
    it("should format empty unbudgeted expenses section", () => {
      const result = service.formatUnbudgetedExpensesSection([]);
      expect(result).toContain("=== Unbudgeted Expenses ===");
      expect(result).toContain("No unbudgeted expense transactions found");
    });

    it("should format unbudgeted expenses section with transactions", () => {
      const result = service.formatUnbudgetedExpensesSection([
        mockTransaction as TransactionSplit,
      ]);
      expect(result).toContain("=== Unbudgeted Expenses ===");
      expect(result).toContain("Test Transaction");
      expect(result).toContain("$100.00");
      expect(result).toContain("Total Unbudgeted Expenses");
    });
  });

  describe("formatSummary", () => {
    it("should format summary with all transaction types", () => {
      // Arrange
      const counts = {
        bills: 2,
        transfers: 3,
        deposits: 4,
        other: 1,
      };

      const additionalIncome = [
        {
          amount: "100.00",
          currency_symbol: "$",
        } as TransactionSplit,
      ];

      const unbudgetedExpenses = [
        {
          amount: "-50.00",
          currency_symbol: "$",
        } as TransactionSplit,
      ];

      // Act
      const result = service.formatSummary(
        counts,
        additionalIncome,
        unbudgetedExpenses,
        500.00
      );

      // Assert
      expect(result).toContain("=== Summary ===");
      expect(result).toContain("Bills:\t2");
      expect(result).toContain("Transfers:\t3");
      expect(result).toContain("Deposits:\t4");
      expect(result).toContain("Other:\t1");
      expect(result).toContain("Additional Income:     $100.00");
      expect(result).toContain("Unbudgeted Expenses:   $50.00");
      expect(result).toContain("Paycheck Surplus:      $500.00");
    });
  });

  describe("getTransactionCounts", () => {
    it("should count transactions by type", () => {
      // Reset mock implementations
      transactionPropertyService.isBill.mockReset();
      transactionPropertyService.isTransfer.mockReset();
      transactionPropertyService.isDeposit.mockReset();

      // Set up mock implementations for each transaction
      const transactions = Array(4).fill(mockTransaction) as TransactionSplit[];

      // Transaction 1: Bill
      transactionPropertyService.isBill.mockImplementationOnce(() => true);

      // Transaction 2: Transfer
      transactionPropertyService.isBill.mockImplementationOnce(() => false);
      transactionPropertyService.isTransfer.mockImplementationOnce(() => true);

      // Transaction 3: Deposit
      transactionPropertyService.isBill.mockImplementationOnce(() => false);
      transactionPropertyService.isTransfer.mockImplementationOnce(() => false);
      transactionPropertyService.isDeposit.mockImplementationOnce(() => true);

      // Transaction 4: Other
      transactionPropertyService.isBill.mockImplementationOnce(() => false);
      transactionPropertyService.isTransfer.mockImplementationOnce(() => false);
      transactionPropertyService.isDeposit.mockImplementationOnce(() => false);

      const result = service.getTransactionCounts(transactions);

      expect(result).toEqual({
        bills: 1,
        transfers: 1,
        deposits: 1,
        other: 1,
      });

      expect(transactionPropertyService.isBill).toHaveBeenCalledTimes(4);
      expect(transactionPropertyService.isTransfer).toHaveBeenCalledTimes(3);
      expect(transactionPropertyService.isDeposit).toHaveBeenCalledTimes(2);
    });
  });
});
