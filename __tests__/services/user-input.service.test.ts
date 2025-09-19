import { UserInputService } from "../../src/services/user-input.service";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import inquirer from "inquirer";

// Mock inquirer
jest.mock("inquirer", () => ({
    prompt: jest.fn(),
}));

// Mock chalk to return the input string (disable styling for tests)
jest.mock("chalk", () => ({
    redBright: (str: string) => str,
    cyan: (str: string) => str,
    yellow: (str: string) => str,
    gray: (str: string) => str,
    bold: (str: string) => str,
}));

//TODO(DEREK) - Need to add testing for transactionId and the new base url
describe("UserInputService", () => {
    let service: UserInputService;
    let consoleLogSpy: jest.SpyInstance;
    let promptMock: jest.Mock;

    const mockBaseUrl = "http://derek.pro";

    beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
        promptMock = inquirer.prompt as unknown as jest.Mock;
        promptMock.mockReset();

        service = new UserInputService(mockBaseUrl);
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    describe("askToUpdateTransaction", () => {
        const mockTransaction: Partial<TransactionSplit> = {
            description: "Test Transaction",
            category_name: "Old Category",
            budget_name: "Old Budget",
        };

        const mockTransactionId = "5";

        it("should throw error when transaction is null", async () => {
            await expect(
                service.askToUpdateTransaction(
                    null as unknown as TransactionSplit,
                    mockTransactionId,
                    {},
                ),
            ).rejects.toThrow("Transaction cannot be null or undefined");
        });

        it("should return false when no changes are proposed", async () => {
            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                {
                    category: mockTransaction.category_name ?? undefined,
                    budget: mockTransaction.budget_name ?? undefined,
                },
            );

            expect(result).toBe(false);
            expect(promptMock).not.toHaveBeenCalled();
            expect(consoleLogSpy).not.toHaveBeenCalled();
        });

        it("should prompt for category change only", async () => {
            const newCategory = "New Category";
            promptMock.mockResolvedValueOnce({ update: true });

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { category: newCategory },
            );

            expect(result).toBe(true);
            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    type: "confirm",
                    name: "update",
                    default: true,
                }),
            ]);
            expect(consoleLogSpy).toHaveBeenCalledWith("\n");
        });

        it("should prompt for budget change only", async () => {
            const newBudget = "New Budget";
            promptMock.mockResolvedValueOnce({ update: false });

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { budget: newBudget },
            );

            expect(result).toBe(false);
            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    type: "confirm",
                    name: "update",
                    default: true,
                }),
            ]);
            expect(consoleLogSpy).toHaveBeenCalledWith("\n");
        });

        it("should prompt for both category and budget changes", async () => {
            const newCategory = "New Category";
            const newBudget = "New Budget";
            promptMock.mockResolvedValueOnce({ update: true });

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { category: newCategory, budget: newBudget },
            );

            expect(result).toBe(true);
            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    type: "confirm",
                    name: "update",
                    default: true,
                }),
            ]);
            expect(consoleLogSpy).toHaveBeenCalledWith("\n");
        });

        it("should handle undefined current values", async () => {
            const mockTransactionWithoutValues: Partial<TransactionSplit> = {
                description: "Test Transaction",
            };

            const newCategory = "New Category";
            const newBudget = "New Budget";
            promptMock.mockResolvedValueOnce({ update: true });

            const result = await service.askToUpdateTransaction(
                mockTransactionWithoutValues as TransactionSplit,
                mockTransactionId,
                { category: newCategory, budget: newBudget },
            );

            expect(result).toBe(true);
            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    type: "confirm",
                    name: "update",
                    default: true,
                }),
            ]);
            expect(consoleLogSpy).toHaveBeenCalledWith("\n");
        });

        it("should truncate long transaction descriptions", async () => {
            const longDescription = "A".repeat(100);
            const mockTransactionWithLongDesc: Partial<TransactionSplit> = {
                description: longDescription,
                category_name: "Old Category",
                budget_name: "Old Budget",
            };

            promptMock.mockResolvedValueOnce({ update: true });

            const result = await service.askToUpdateTransaction(
                mockTransactionWithLongDesc as TransactionSplit,
                mockTransactionId,
                { category: "New Category", budget: "New Budget" },
            );

            expect(result).toBe(true);
            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    message: expect.stringContaining("..."),
                }),
            ]);
            expect(consoleLogSpy).toHaveBeenCalledWith("\n");
        });
    });
});
