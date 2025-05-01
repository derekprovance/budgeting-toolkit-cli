import { BudgetService } from "../../../src/services/core/budget.service";
import {
  FireflyApiClient,
  FireflyApiError,
} from "@derekprovance/firefly-iii-sdk";
import {
  BudgetArray,
  BudgetLimitArray,
  InsightGroup,
} from "@derekprovance/firefly-iii-sdk";

describe("BudgetService", () => {
  let budgetService: BudgetService;
  let mockApiClient: jest.Mocked<FireflyApiClient>;

  beforeEach(() => {
    mockApiClient = {
      get: jest.fn(),
    } as unknown as jest.Mocked<FireflyApiClient>;
    budgetService = new BudgetService(mockApiClient);
  });

  describe("getBudgets", () => {
    it("should return active budgets", async () => {
      const mockBudgets: BudgetArray = {
        data: [
          {
            id: "1",
            type: "budgets",
            attributes: {
              name: "Test Budget 1",
              active: true,
            },
          },
          {
            id: "2",
            type: "budgets",
            attributes: {
              name: "Test Budget 2",
              active: false,
            },
          },
        ],
        meta: {
          pagination: {
            total: 2,
            count: 2,
            per_page: 10,
            current_page: 1,
            total_pages: 1,
          },
        },
      };

      mockApiClient.get.mockResolvedValue(mockBudgets);

      const result = await budgetService.getBudgets();

      expect(mockApiClient.get).toHaveBeenCalledWith("/budgets");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
      expect(result[0].attributes.name).toBe("Test Budget 1");
    });

    it("should throw error when API call fails", async () => {
      mockApiClient.get.mockRejectedValue(
        new FireflyApiError("Failed to fetch budgets")
      );

      await expect(budgetService.getBudgets()).rejects.toThrow(
        "Failed to fetch budgets"
      );
    });

    it("should throw error when API returns null", async () => {
      mockApiClient.get.mockResolvedValue(null);

      await expect(budgetService.getBudgets()).rejects.toThrow(
        "Failed to fetch budgets"
      );
    });
  });

  describe("getBudgetExpenseInsights", () => {
    it("should return budget expense insights for given month and year", async () => {
      const mockInsights = [
        {
          id: "1",
          attributes: {
            name: "Test Insight",
            amount: 100,
          },
        },
      ] as unknown as InsightGroup;

      mockApiClient.get.mockResolvedValue(mockInsights);

      const result = await budgetService.getBudgetExpenseInsights(3, 2024);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining("/insight/expense/budget")
      );
      expect(result).toEqual(mockInsights);
    });

    it("should throw error for invalid month", async () => {
      await expect(
        budgetService.getBudgetExpenseInsights(13, 2024)
      ).rejects.toThrow();
    });

    it("should throw error when API call fails", async () => {
      mockApiClient.get.mockRejectedValue(
        new FireflyApiError("Failed to get budget expense insights for month 3")
      );

      await expect(
        budgetService.getBudgetExpenseInsights(3, 2024)
      ).rejects.toThrow("Failed to get budget expense insights for month 3");
    });

    it("should throw error when API returns null", async () => {
      mockApiClient.get.mockResolvedValue(null);

      await expect(
        budgetService.getBudgetExpenseInsights(3, 2024)
      ).rejects.toThrow("Failed to fetch expense insights for budget");
    });

    it("should handle non-Error exceptions", async () => {
      mockApiClient.get.mockRejectedValue("Some non-error rejection");

      await expect(
        budgetService.getBudgetExpenseInsights(3, 2024)
      ).rejects.toThrow("Failed to get budget expense insights for month 3");
    });
  });

  describe("getBudgetLimits", () => {
    it("should return budget limits for given month and year", async () => {
      const mockLimits: BudgetLimitArray = {
        data: [
          {
            id: "1",
            type: "budget-limits",
            attributes: {
              amount: "1000",
              start: "2024-03-01",
              end: "2024-03-31",
              budget_id: "1",
            },
          },
        ],
        meta: {
          pagination: {
            total: 1,
            count: 1,
            per_page: 10,
            current_page: 1,
            total_pages: 1,
          },
        },
      };

      mockApiClient.get.mockResolvedValue(mockLimits);

      const result = await budgetService.getBudgetLimits(3, 2024);

      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining("/budget-limits")
      );
      expect(result).toEqual(mockLimits.data);
    });

    it("should throw error for invalid month", async () => {
      await expect(budgetService.getBudgetLimits(13, 2024)).rejects.toThrow();
    });

    it("should throw error when API call fails", async () => {
      mockApiClient.get.mockRejectedValue(
        new FireflyApiError("Failed to get budget limits for month 3")
      );

      await expect(budgetService.getBudgetLimits(3, 2024)).rejects.toThrow(
        "Failed to get budget limits for month 3"
      );
    });

    it("should throw error when API returns null", async () => {
      mockApiClient.get.mockResolvedValue(null);

      await expect(budgetService.getBudgetLimits(3, 2024)).rejects.toThrow(
        "Failed to fetch expense insights for budget"
      );
    });

    it("should handle non-Error exceptions", async () => {
      mockApiClient.get.mockRejectedValue("Some non-error rejection");

      await expect(budgetService.getBudgetLimits(3, 2024)).rejects.toThrow(
        "Failed to get budget limits for month 3"
      );
    });
  });
});
