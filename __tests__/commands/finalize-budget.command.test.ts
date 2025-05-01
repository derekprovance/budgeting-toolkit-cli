import { FinalizeBudgetCommand } from "../../src/commands/finalize-budget.command";
import { AdditionalIncomeService } from "../../src/services/additional-income.service";
import { UnbudgetedExpenseService } from "../../src/services/unbudgeted-expense.service";
import { TransactionPropertyService } from "../../src/services/core/transaction-property.service";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";

// Mock services
jest.mock("../../src/services/additional-income.service");
jest.mock("../../src/services/unbudgeted-expense.service");
jest.mock("../../src/services/core/transaction-property.service");
jest.mock("../../src/services/finalize-budget-display.service");

describe("FinalizeBudgetCommand", () => {
  let command: FinalizeBudgetCommand;
  let additionalIncomeService: jest.Mocked<AdditionalIncomeService>;
  let unbudgetedExpenseService: jest.Mocked<UnbudgetedExpenseService>;
  let transactionPropertyService: jest.Mocked<TransactionPropertyService>;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  const mockTransaction: Partial<TransactionSplit> = {
    description: "Test Transaction",
    amount: "100.00",
    date: "2024-05-15",
    currency_symbol: "$",
    category_name: "Test Category",
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup service mocks
    additionalIncomeService = {
      calculateAdditionalIncome: jest.fn().mockResolvedValue([mockTransaction]),
    } as unknown as jest.Mocked<AdditionalIncomeService>;

    unbudgetedExpenseService = {
      calculateUnbudgetedExpenses: jest.fn().mockResolvedValue([mockTransaction]),
    } as unknown as jest.Mocked<UnbudgetedExpenseService>;

    transactionPropertyService = {
      isBill: jest.fn().mockReturnValue(false),
      isTransfer: jest.fn().mockReturnValue(false),
      isDeposit: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<TransactionPropertyService>;

    // Create command instance
    command = new FinalizeBudgetCommand(
      additionalIncomeService,
      unbudgetedExpenseService,
      transactionPropertyService
    );

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe("execute", () => {
    it("should execute successfully with data", async () => {
      await command.execute({ month: 5, year: 2024 });

      expect(additionalIncomeService.calculateAdditionalIncome).toHaveBeenCalledWith(5, 2024);
      expect(unbudgetedExpenseService.calculateUnbudgetedExpenses).toHaveBeenCalledWith(5, 2024);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should execute successfully with no data", async () => {
      additionalIncomeService.calculateAdditionalIncome.mockResolvedValueOnce([]);
      unbudgetedExpenseService.calculateUnbudgetedExpenses.mockResolvedValueOnce([]);

      await command.execute({ month: 5, year: 2024 });

      expect(additionalIncomeService.calculateAdditionalIncome).toHaveBeenCalledWith(5, 2024);
      expect(unbudgetedExpenseService.calculateUnbudgetedExpenses).toHaveBeenCalledWith(5, 2024);
      expect(consoleLogSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should handle errors from additional income service", async () => {
      const error = new Error("Additional income error");
      additionalIncomeService.calculateAdditionalIncome.mockRejectedValueOnce(error);

      await expect(command.execute({ month: 5, year: 2024 })).rejects.toThrow(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error finalizing budget"),
        expect.stringContaining("Additional income error")
      );
    });

    it("should handle errors from unbudgeted expense service", async () => {
      const error = new Error("Unbudgeted expense error");
      unbudgetedExpenseService.calculateUnbudgetedExpenses.mockRejectedValueOnce(error);

      await expect(command.execute({ month: 5, year: 2024 })).rejects.toThrow(error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error finalizing budget"),
        expect.stringContaining("Unbudgeted expense error")
      );
    });
  });
}); 