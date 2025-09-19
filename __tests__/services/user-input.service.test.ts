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

    describe("Base URL and Transaction Link Functionality", () => {
        const mockTransaction: Partial<TransactionSplit> = {
            description: "Test Transaction",
            category_name: "Old Category",
            budget_name: "Old Budget",
        };

        it("should include hyperlink in description when transaction ID is provided", async () => {
            const transactionId = "123";
            const newCategory = "New Category";
            promptMock.mockResolvedValueOnce({ update: true });

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                transactionId,
                { category: newCategory },
            );

            const expectedLink = `${mockBaseUrl}/transactions/show/${transactionId}`;
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${mockTransaction.description}\x1B]8;;\x1B\\`;

            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                }),
            ]);
        });

        it("should not include hyperlink when transaction ID is undefined", async () => {
            const newCategory = "New Category";
            promptMock.mockResolvedValueOnce({ update: true });

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                undefined,
                { category: newCategory },
            );

            // Should not contain ANSI escape sequences for hyperlinks
            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    message: expect.not.stringContaining("\x1B]8;;"),
                }),
            ]);

            // Should contain the plain description
            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    message: expect.stringContaining(mockTransaction.description as string),
                }),
            ]);
        });

        it("should include hyperlink with truncated description for long descriptions", async () => {
            const longDescription = "A".repeat(100);
            const mockTransactionWithLongDesc: Partial<TransactionSplit> = {
                description: longDescription,
                category_name: "Old Category",
            };
            const transactionId = "456";
            const newCategory = "New Category";
            promptMock.mockResolvedValueOnce({ update: true });

            await service.askToUpdateTransaction(
                mockTransactionWithLongDesc as TransactionSplit,
                transactionId,
                { category: newCategory },
            );

            const expectedLink = `${mockBaseUrl}/transactions/show/${transactionId}`;
            const truncatedDescription = longDescription.substring(0, 47) + "...";
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${truncatedDescription}\x1B]8;;\x1B\\`;

            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                }),
            ]);
        });

        it("should construct correct transaction URL with different base URLs", async () => {
            const customBaseUrl = "https://firefly.example.com";
            const customService = new UserInputService(customBaseUrl);
            const transactionId = "789";
            const newBudget = "New Budget";
            promptMock.mockResolvedValueOnce({ update: true });

            await customService.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                transactionId,
                { budget: newBudget },
            );

            const expectedLink = `${customBaseUrl}/transactions/show/${transactionId}`;
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${mockTransaction.description}\x1B]8;;\x1B\\`;

            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                }),
            ]);
        });

        it("should handle empty transaction ID as no hyperlink", async () => {
            const newCategory = "New Category";
            promptMock.mockResolvedValueOnce({ update: true });

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                "",
                { category: newCategory },
            );

            // Empty string is falsy, so should not generate hyperlink
            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    message: expect.not.stringContaining("\x1B]8;;"),
                }),
            ]);

            // Should contain the plain description
            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    message: expect.stringContaining(mockTransaction.description as string),
                }),
            ]);
        });

        it("should properly format hyperlink with special characters in description", async () => {
            const specialDescTransaction: Partial<TransactionSplit> = {
                description: "Transaction with & < > \" ' special chars",
                category_name: "Old Category",
            };
            const transactionId = "999";
            const newCategory = "New Category";
            promptMock.mockResolvedValueOnce({ update: true });

            await service.askToUpdateTransaction(
                specialDescTransaction as TransactionSplit,
                transactionId,
                { category: newCategory },
            );

            const expectedLink = `${mockBaseUrl}/transactions/show/${transactionId}`;
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${specialDescTransaction.description}\x1B]8;;\x1B\\`;

            expect(promptMock).toHaveBeenCalledWith([
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                }),
            ]);
        });
    });
});
