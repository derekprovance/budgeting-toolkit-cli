import { BillsCommand } from "../../src/commands/test-bills.command";
import { ExpectedBillService } from "../../src/services/expected-bill.service";

// Mock dependencies
jest.mock("../../src/logger");

describe("BillsCommand", () => {
  let command: BillsCommand;
  let mockExpectedBillService: jest.Mocked<ExpectedBillService>;

  beforeEach(() => {
    mockExpectedBillService = {
      getExpectedBillSumForMonth: jest.fn(),
      getAverageMonthlyBillsForYear: jest.fn(),
    } as unknown as jest.Mocked<ExpectedBillService>;
    
    command = new BillsCommand(mockExpectedBillService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("execute", () => {
    it("should display expected bills report for given month and year", async () => {
      // Arrange
      const params = { month: 6, year: 2024 };
      mockExpectedBillService.getExpectedBillSumForMonth.mockResolvedValue(2855.93);
      mockExpectedBillService.getAverageMonthlyBillsForYear.mockResolvedValue(2873.54);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Act
      await command.execute(params);

      // Assert
      expect(mockExpectedBillService.getExpectedBillSumForMonth).toHaveBeenCalledWith(6, 2024);
      expect(mockExpectedBillService.getAverageMonthlyBillsForYear).toHaveBeenCalledWith(2024);
      
      expect(consoleSpy).toHaveBeenCalledWith("Expected Bills Report for 6/2024\n");
      expect(consoleSpy).toHaveBeenCalledWith("Expected bill sum for 6/2024: $2855.93");
      expect(consoleSpy).toHaveBeenCalledWith("Average monthly bills for 2024: $2873.54");

      consoleSpy.mockRestore();
    });

    it("should handle service errors gracefully", async () => {
      // Arrange
      const params = { month: 6, year: 2024 };
      const error = new Error("Service error");
      mockExpectedBillService.getExpectedBillSumForMonth.mockRejectedValue(error);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      // Act & Assert
      await expect(command.execute(params)).rejects.toThrow('process.exit called');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith("❌ Error calculating expected bills:", "Service error");
      expect(processExitSpy).toHaveBeenCalledWith(1);

      consoleErrorSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it("should format currency amounts correctly", async () => {
      // Arrange
      const params = { month: 12, year: 2023 };
      mockExpectedBillService.getExpectedBillSumForMonth.mockResolvedValue(1234.567);
      mockExpectedBillService.getAverageMonthlyBillsForYear.mockResolvedValue(9876.543);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Act
      await command.execute(params);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith("Expected bill sum for 12/2023: $1234.57");
      expect(consoleSpy).toHaveBeenCalledWith("Average monthly bills for 2023: $9876.54");

      consoleSpy.mockRestore();
    });

    it("should handle zero amounts", async () => {
      // Arrange
      const params = { month: 1, year: 2024 };
      mockExpectedBillService.getExpectedBillSumForMonth.mockResolvedValue(0);
      mockExpectedBillService.getAverageMonthlyBillsForYear.mockResolvedValue(0);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Act
      await command.execute(params);

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith("Expected bill sum for 1/2024: $0.00");
      expect(consoleSpy).toHaveBeenCalledWith("Average monthly bills for 2024: $0.00");

      consoleSpy.mockRestore();
    });
  });
});