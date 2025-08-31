import { BudgetService } from "../../src/services/core/budget.service";
import { FireflyApiClient } from "@derekprovance/firefly-iii-sdk";
import {
    BudgetLimitRead,
    BudgetRead,
    InsightGroup,
} from "@derekprovance/firefly-iii-sdk";
import { DateRangeService } from "../../src/types/interface/date-range.service.interface";

jest.mock("@derekprovance/firefly-iii-sdk");
jest.mock("../../src/types/interface/date-range.service.interface");

describe("BudgetService", () => {
    let budgetService: BudgetService;
    let mockApiClient: jest.Mocked<FireflyApiClient>;

    beforeEach(() => {
        mockApiClient = new FireflyApiClient({
            baseUrl: "http://localhost",
            apiToken: "test-token",
        }) as jest.Mocked<FireflyApiClient>;
        budgetService = new BudgetService(mockApiClient);
    });

    describe("getBudgets", () => {
        it("should return active budgets", async () => {
            const mockBudgets: BudgetRead[] = [
                {
                    id: "1",
                    attributes: { name: "Budget 1", active: true },
                },
                {
                    id: "2",
                    attributes: { name: "Budget 2", active: false },
                },
            ] as BudgetRead[];

            mockApiClient.get.mockResolvedValueOnce({
                data: mockBudgets,
            });

            const result = await budgetService.getBudgets();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
            expect(result[0].attributes.name).toBe("Budget 1");
            expect(mockApiClient.get).toHaveBeenCalledWith("/budgets");
        });

        it("should throw error when API call fails", async () => {
            mockApiClient.get.mockRejectedValueOnce(new Error("API Error"));

            await expect(budgetService.getBudgets()).rejects.toThrow(
                "API Error",
            );
        });
    });

    describe("getBudgetExpenseInsights", () => {
        it("should return budget expense insights", async () => {
            const mockStartDate = new Date("2024-01-01T00:00:00.000Z");
            const mockEndDate = new Date("2024-01-31T23:59:59.999Z");

            (DateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            const mockInsights = {
                data: [
                    {
                        id: "1",
                        difference_float: 100.0,
                    },
                ],
            } as unknown as InsightGroup;

            mockApiClient.get.mockResolvedValueOnce(mockInsights);

            const result = await budgetService.getBudgetExpenseInsights(
                1,
                2024,
            );

            expect(result).toEqual(mockInsights);
            expect(mockApiClient.get).toHaveBeenCalledWith(
                `/insight/expense/budget?start=${mockStartDate.toISOString()}&end=${mockEndDate.toISOString()}`,
            );
        });

        it("should format dates correctly in API call", async () => {
            const mockStartDate = new Date("2024-01-01T00:00:00.000Z");
            const mockEndDate = new Date("2024-01-31T23:59:59.999Z");

            (DateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            mockApiClient.get.mockResolvedValueOnce({} as InsightGroup);

            await budgetService.getBudgetExpenseInsights(1, 2024);

            expect(mockApiClient.get).toHaveBeenCalledWith(
                `/insight/expense/budget?start=${mockStartDate.toISOString()}&end=${mockEndDate.toISOString()}`,
            );
        });

        it("should throw error when API call fails", async () => {
            mockApiClient.get.mockRejectedValueOnce(new Error("API Error"));

            await expect(
                budgetService.getBudgetExpenseInsights(1, 2024),
            ).rejects.toThrow(
                "Failed to get budget expense insights for month 1",
            );
        });

        it("should validate month and year", async () => {
            await expect(
                budgetService.getBudgetExpenseInsights(0, 2024),
            ).rejects.toThrow();
            await expect(
                budgetService.getBudgetExpenseInsights(13, 2024),
            ).rejects.toThrow();
        });
    });

    describe("getBudgetLimits", () => {
        it("should return budget limits", async () => {
            const mockLimits: BudgetLimitRead[] = [
                {
                    id: "1",
                    attributes: { budget_id: "1", amount: "100.00" },
                },
            ] as BudgetLimitRead[];

            mockApiClient.get.mockResolvedValueOnce({
                data: mockLimits,
            });

            const result = await budgetService.getBudgetLimits(1, 2024);

            expect(result).toEqual(mockLimits);
            expect(mockApiClient.get).toHaveBeenCalledWith(
                expect.stringContaining("/budget-limits"),
            );
        });

        it("should format dates correctly in API call", async () => {
            const mockStartDate = new Date("2024-01-01T00:00:00.000Z");
            const mockEndDate = new Date("2024-01-31T23:59:59.999Z");

            (DateRangeService.getDateRange as jest.Mock).mockReturnValue({
                startDate: mockStartDate,
                endDate: mockEndDate,
            });

            mockApiClient.get.mockResolvedValueOnce({
                data: [],
            });

            await budgetService.getBudgetLimits(1, 2024);

            expect(mockApiClient.get).toHaveBeenCalledWith(
                `/budget-limits?start=${mockStartDate.toISOString()}&end=${mockEndDate.toISOString()}`,
            );
        });

        it("should throw error when API call fails", async () => {
            mockApiClient.get.mockRejectedValueOnce(new Error("API Error"));

            await expect(
                budgetService.getBudgetLimits(1, 2024),
            ).rejects.toThrow("Failed to get budget limits for month 1");
        });

        it("should validate month and year", async () => {
            await expect(
                budgetService.getBudgetLimits(0, 2024),
            ).rejects.toThrow();
            await expect(
                budgetService.getBudgetLimits(13, 2024),
            ).rejects.toThrow();
        });
    });
});
