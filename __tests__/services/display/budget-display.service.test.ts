import { BudgetDisplayService } from "../../../src/services/display/budget-display.service";
import { BudgetStatus } from "../../../src/types/interface/budget-status.interface";

// Mock chalk to return the input string (disable styling for tests)
jest.mock("chalk", () => ({
    redBright: (str: string) => str,
    cyan: (str: string) => str,
    yellow: (str: string) => str,
    gray: (str: string) => str,
    bold: (str: string) => str,
    green: (str: string) => str,
    red: (str: string) => str,
    cyanBright: (str: string) => str,
}));

describe("BudgetDisplayService", () => {
    let service: BudgetDisplayService;

    beforeEach(() => {
        service = new BudgetDisplayService();
    });

    describe("formatHeader", () => {
        it("should format header with current month info", () => {
            const result = service.formatHeader(
                5,
                2024,
                15,
                50,
                new Date("2024-05-15"),
            );
            expect(result).toContain("Budget Status Report");
            expect(result).toContain("May 2024");
            expect(result).toContain("15 days remaining");
            expect(result).toContain("Last Updated: 2024-05-15");
        });

        it("should format header without current month info", () => {
            const result = service.formatHeader(5, 2024);
            expect(result).toContain("Budget Status Report");
            expect(result).toContain("May 2024");
            expect(result).not.toContain("days remaining");
            expect(result).not.toContain("Last Updated");
        });
    });

    describe("formatBudgetItem", () => {
        const mockStatus: BudgetStatus = {
            name: "Test Budget",
            amount: 1000,
            spent: -500,
        };

        it("should format budget item for current month", () => {
            const result = service.formatBudgetItem(
                mockStatus,
                20,
                true,
                15,
                30,
            );
            expect(result).toContain("Test Budget");
            expect(result).toContain("$500.00");
            expect(result).toContain("$1,000.00");
            expect(result).toContain("50.0%");
            expect(result).toContain("Remaining: $500.00");
        });

        it("should format budget item for non-current month", () => {
            const result = service.formatBudgetItem(mockStatus, 20, false);
            expect(result).toContain("Test Budget");
            expect(result).toContain("$500.00");
            expect(result).toContain("$1,000.00");
            expect(result).toContain("50.0%");
            expect(result).toContain("Remaining: $500.00");
        });
    });

    describe("formatSummary", () => {
        it("should format summary for current month", () => {
            const result = service.formatSummary(500, 1000, 20, true, 15, 30);
            expect(result).toContain("TOTAL");
            expect(result).toContain("$500.00");
            expect(result).toContain("$1,000.00");
            expect(result).toContain("50.0%");
        });

        it("should format summary for non-current month", () => {
            const result = service.formatSummary(500, 1000, 20, false);
            expect(result).toContain("TOTAL");
            expect(result).toContain("$500.00");
            expect(result).toContain("$1,000.00");
            expect(result).toContain("50.0%");
        });
    });

    describe("getSpendRateWarning", () => {
        it("should return warning when spend rate is too high", () => {
            const result = service.getSpendRateWarning(80, 30);
            expect(result).toContain(
                "Warning: Current spend rate is higher than ideal",
            );
        });

        it("should return null when spend rate is acceptable", () => {
            const result = service.getSpendRateWarning(30, 40);
            expect(result).toBeNull();
        });
    });
});
