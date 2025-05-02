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

    it("should format additional income section with bill transaction", () => {
      transactionPropertyService.isBill.mockReturnValueOnce(true);
      const result = service.formatAdditionalIncomeSection([
        mockTransaction as TransactionSplit,
      ]);
      expect(result).toContain("=== Additional Income ===");
      expect(result).toContain("[BILL]");
      expect(result).toContain("Test Transaction");
      expect(result).toContain("$100.00");
      expect(result).toContain("Total Additional Income");
    });

    it("should format additional income section with transfer transaction", () => {
      transactionPropertyService.isBill.mockReturnValueOnce(false);
      transactionPropertyService.isTransfer.mockReturnValueOnce(true);
      const result = service.formatAdditionalIncomeSection([
        mockTransaction as TransactionSplit,
      ]);
      expect(result).toContain("=== Additional Income ===");
      expect(result).toContain("[TRANSFER]");
      expect(result).toContain("Test Transaction");
      expect(result).toContain("$100.00");
      expect(result).toContain("Total Additional Income");
    });

    it("should format additional income section with deposit transaction", () => {
      transactionPropertyService.isBill.mockReturnValueOnce(false);
      transactionPropertyService.isTransfer.mockReturnValueOnce(false);
      transactionPropertyService.isDeposit.mockReturnValueOnce(true);
      const result = service.formatAdditionalIncomeSection([
        mockTransaction as TransactionSplit,
      ]);
      expect(result).toContain("=== Additional Income ===");
      expect(result).toContain("[DEPOSIT]");
      expect(result).toContain("Test Transaction");
      expect(result).toContain("$100.00");
      expect(result).toContain("Total Additional Income");
    });

    it("should format additional income section with other transaction", () => {
      transactionPropertyService.isBill.mockReturnValueOnce(false);
      transactionPropertyService.isTransfer.mockReturnValueOnce(false);
      transactionPropertyService.isDeposit.mockReturnValueOnce(false);
      const result = service.formatAdditionalIncomeSection([
        mockTransaction as TransactionSplit,
      ]);
      expect(result).toContain("=== Additional Income ===");
      expect(result).toContain("[OTHER]");
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

    it("should format unbudgeted expenses section with bill transaction", () => {
      transactionPropertyService.isBill.mockReturnValueOnce(true);
      const result = service.formatUnbudgetedExpensesSection([
        mockTransaction as TransactionSplit,
      ]);
      expect(result).toContain("=== Unbudgeted Expenses ===");
      expect(result).toContain("[BILL]");
      expect(result).toContain("Test Transaction");
      expect(result).toContain("$100.00");
      expect(result).toContain("Total Unbudgeted Expenses");
    });

    it("should format unbudgeted expenses section with transfer transaction", () => {
      transactionPropertyService.isBill.mockReturnValueOnce(false);
      transactionPropertyService.isTransfer.mockReturnValueOnce(true);
      const result = service.formatUnbudgetedExpensesSection([
        mockTransaction as TransactionSplit,
      ]);
      expect(result).toContain("=== Unbudgeted Expenses ===");
      expect(result).toContain("[TRANSFER]");
      expect(result).toContain("Test Transaction");
      expect(result).toContain("$100.00");
      expect(result).toContain("Total Unbudgeted Expenses");
    });

    it("should format unbudgeted expenses section with deposit transaction", () => {
      transactionPropertyService.isBill.mockReturnValueOnce(false);
      transactionPropertyService.isTransfer.mockReturnValueOnce(false);
      transactionPropertyService.isDeposit.mockReturnValueOnce(true);
      const result = service.formatUnbudgetedExpensesSection([
        mockTransaction as TransactionSplit,
      ]);
      expect(result).toContain("=== Unbudgeted Expenses ===");
      expect(result).toContain("[DEPOSIT]");
      expect(result).toContain("Test Transaction");
      expect(result).toContain("$100.00");
      expect(result).toContain("Total Unbudgeted Expenses");
    });

    it("should format unbudgeted expenses section with other transaction", () => {
      transactionPropertyService.isBill.mockReturnValueOnce(false);
      transactionPropertyService.isTransfer.mockReturnValueOnce(false);
      transactionPropertyService.isDeposit.mockReturnValueOnce(false);
      const result = service.formatUnbudgetedExpensesSection([
        mockTransaction as TransactionSplit,
      ]);
      expect(result).toContain("=== Unbudgeted Expenses ===");
      expect(result).toContain("[OTHER]");
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
});
