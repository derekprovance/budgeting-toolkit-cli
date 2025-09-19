// Mock chalk with chained methods
const createChalkMock = () => {
    interface ChalkChain {
        (text: string): string;
        bold: ChalkChain;
        cyan: ChalkChain;
        yellow: ChalkChain;
        blue: ChalkChain;
        blueBright: ChalkChain;
        gray: ChalkChain;
        green: ChalkChain;
        red: ChalkChain;
        redBright: ChalkChain;
        white: ChalkChain;
    }

    const chainedFn = ((text: string) => text) as unknown as ChalkChain;
    const methods = [
        "bold",
        "cyan",
        "yellow",
        "blue",
        "blueBright",
        "gray",
        "green",
        "red",
        "redBright",
        "white",
    ] as const;

    methods.forEach((method) => {
        chainedFn[method] = ((text?: string) => {
            if (text === undefined) {
                return chainedFn;
            }
            return text;
        }) as unknown as ChalkChain;
    });

    return chainedFn;
};

jest.mock("chalk", () => createChalkMock());

import { UpdateTransactionDisplayService } from "../../../src/services/display/update-transaction-display.service";
import { UpdateTransactionMode } from "../../../src/types/enum/update-transaction-mode.enum";
import { UpdateTransactionStatus } from "../../../src/types/enum/update-transaction-status.enum";
import { UpdateTransactionStatusDto } from "../../../src/types/dto/update-transaction-status.dto";

describe("UpdateTransactionDisplayService", () => {
    let service: UpdateTransactionDisplayService;

    beforeEach(() => {
        service = new UpdateTransactionDisplayService();
    });

    describe("formatProcessingHeader", () => {
        it("should format the processing header correctly", () => {
            const result = service.formatProcessingHeader(
                "test-tag",
                UpdateTransactionMode.Both,
            );
            expect(result).toContain(
                'Processing transactions with tag "test-tag" for categories and budgets',
            );
        });
    });

    describe("formatTagNotFound", () => {
        it("should format the tag not found message correctly", () => {
            const result = service.formatTagNotFound("test-tag");
            expect(result).toContain('❌ Tag "test-tag" not found');
        });
    });

    describe("formatEmptyTag", () => {
        it("should format the empty tag message correctly", () => {
            const result = service.formatEmptyTag("test-tag");
            expect(result).toContain(
                'No transactions found with tag "test-tag"',
            );
        });
    });

    describe("formatTransactionUpdates", () => {
        it("should format updates correctly when there are no changes", () => {
            const results = {
                status: UpdateTransactionStatus.HAS_RESULTS,
                totalTransactions: 0,
                data: [],
            };

            const [text, count] = service.formatTransactionUpdates(
                results,
                UpdateTransactionMode.Both,
            );
            expect(text).toBe("");
            expect(count).toBe(0);
        });

        it("should format category updates correctly", () => {
            const results = {
                status: UpdateTransactionStatus.HAS_RESULTS,
                totalTransactions: 1,
                data: [
                    {
                        id: "1",
                        name: "Test Transaction",
                        category: "Old Category",
                        updatedCategory: "New Category",
                    },
                ],
            };

            const [text, count] = service.formatTransactionUpdates(
                results,
                UpdateTransactionMode.Category,
            );
            expect(text).toContain("Test Transaction");
            expect(text).toContain("Category: Old Category ➜ New Category");
            expect(count).toBe(1);
        });

        it("should format budget updates correctly", () => {
            const results = {
                status: UpdateTransactionStatus.HAS_RESULTS,
                totalTransactions: 1,
                data: [
                    {
                        id: "1",
                        name: "Test Transaction",
                        budget: "Old Budget",
                        updatedBudget: "New Budget",
                    },
                ],
            };

            const [text, count] = service.formatTransactionUpdates(
                results,
                UpdateTransactionMode.Budget,
            );
            expect(text).toContain("Test Transaction");
            expect(text).toContain("Budget: Old Budget ➜ New Budget");
            expect(count).toBe(1);
        });
    });

    describe("formatSummary", () => {
        it("should format the summary correctly", () => {
            const results: UpdateTransactionStatusDto = {
                status: UpdateTransactionStatus.HAS_RESULTS,
                totalTransactions: 2,
                data: [
                    {
                        name: "Test Transaction 1",
                        category: "New Category 1",
                        updatedCategory: "New Category 1",
                        budget: "New Budget 1",
                        updatedBudget: "New Budget 1",
                    },
                    {
                        name: "Test Transaction 2",
                        category: "New Category 2",
                        updatedCategory: "New Category 2",
                        budget: "New Budget 2",
                        updatedBudget: "New Budget 2",
                    },
                ],
            };

            const result = service.formatSummary(results, 2);
            expect(result).toContain(
                "Successfully updated 2 of 2 transactions",
            );
        });
    });

    describe("formatError", () => {
        it("should format error messages correctly", () => {
            const error = new Error("Test error message");
            const result = service.formatError(error);
            expect(result).toContain("Error processing transactions");
            expect(result).toContain("Test error message");
        });

        it("should handle non-Error objects", () => {
            const result = service.formatError("Test error");
            expect(result).toContain("Error processing transactions");
            expect(result).toContain("Test error");
        });
    });
});
