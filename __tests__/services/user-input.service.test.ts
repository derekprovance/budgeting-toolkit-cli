import { UserInputService } from "../../src/services/user-input.service";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { UpdateTransactionMode } from "../../src/types/enum/update-transaction-mode.enum";

// Mock @inquirer/prompts
jest.mock("@inquirer/prompts", () => ({
    expand: jest.fn(),
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
    let expandMock: jest.Mock;

    const mockBaseUrl = "http://derek.pro";

    beforeEach(() => {
        const { expand } = require("@inquirer/prompts");
        expandMock = expand as jest.Mock;
        expandMock.mockReset();

        service = new UserInputService(mockBaseUrl);
    });

    afterEach(() => {
        jest.clearAllMocks();
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

        it("should return Abort when no changes are proposed", async () => {
            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                {
                    category: mockTransaction.category_name ?? undefined,
                    budget: mockTransaction.budget_name ?? undefined,
                },
            );

            expect(result).toBe(UpdateTransactionMode.Abort);
            expect(expandMock).not.toHaveBeenCalled();
        });

        it("should prompt for category change only", async () => {
            const newCategory = "New Category";
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Category);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { category: newCategory },
            );

            expect(result).toBe(UpdateTransactionMode.Category);
            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining("Apply these changes?"),
                    default: "a",
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: "a",
                            name: "Update all",
                            value: UpdateTransactionMode.Both,
                        }),
                        expect.objectContaining({
                            key: "c",
                            name: "Update only the category",
                            value: UpdateTransactionMode.Category,
                        }),
                        expect.objectContaining({
                            key: "x",
                            name: "Abort",
                            value: UpdateTransactionMode.Abort,
                        }),
                    ]),
                }),
            );
        });

        it("should prompt for budget change only", async () => {
            const newBudget = "New Budget";
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Budget);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { budget: newBudget },
            );

            expect(result).toBe(UpdateTransactionMode.Budget);
            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining("Apply these changes?"),
                    default: "a",
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: "a",
                            name: "Update all",
                            value: UpdateTransactionMode.Both,
                        }),
                        expect.objectContaining({
                            key: "b",
                            name: "Update only the budget",
                            value: UpdateTransactionMode.Budget,
                        }),
                        expect.objectContaining({
                            key: "x",
                            name: "Abort",
                            value: UpdateTransactionMode.Abort,
                        }),
                    ]),
                }),
            );
        });

        it("should prompt for both category and budget changes", async () => {
            const newCategory = "New Category";
            const newBudget = "New Budget";
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Both);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { category: newCategory, budget: newBudget },
            );

            expect(result).toBe(UpdateTransactionMode.Both);
            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining("Apply these changes?"),
                    default: "a",
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: "a",
                            name: "Update all",
                            value: UpdateTransactionMode.Both,
                        }),
                        expect.objectContaining({
                            key: "b",
                            name: "Update only the budget",
                            value: UpdateTransactionMode.Budget,
                        }),
                        expect.objectContaining({
                            key: "c",
                            name: "Update only the category",
                            value: UpdateTransactionMode.Category,
                        }),
                        expect.objectContaining({
                            key: "x",
                            name: "Abort",
                            value: UpdateTransactionMode.Abort,
                        }),
                    ]),
                }),
            );
        });

        it("should handle undefined current values", async () => {
            const mockTransactionWithoutValues: Partial<TransactionSplit> = {
                description: "Test Transaction",
            };

            const newCategory = "New Category";
            const newBudget = "New Budget";
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Both);

            const result = await service.askToUpdateTransaction(
                mockTransactionWithoutValues as TransactionSplit,
                mockTransactionId,
                { category: newCategory, budget: newBudget },
            );

            expect(result).toBe(UpdateTransactionMode.Both);
            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining("Apply these changes?"),
                    default: "a",
                }),
            );
        });

        it("should truncate long transaction descriptions", async () => {
            const longDescription = "A".repeat(100);
            const mockTransactionWithLongDesc: Partial<TransactionSplit> = {
                description: longDescription,
                category_name: "Old Category",
                budget_name: "Old Budget",
            };

            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Both);

            const result = await service.askToUpdateTransaction(
                mockTransactionWithLongDesc as TransactionSplit,
                mockTransactionId,
                { category: "New Category", budget: "New Budget" },
            );

            expect(result).toBe(UpdateTransactionMode.Both);
            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining("..."),
                }),
            );
        });

        it("should return Abort when user selects abort option", async () => {
            const newCategory = "New Category";
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Abort);

            const result = await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                mockTransactionId,
                { category: newCategory },
            );

            expect(result).toBe(UpdateTransactionMode.Abort);
        });

        it("should show only Update all and Abort choices when only category is proposed but matches budget", async () => {
            const mockTransactionNoBudget: Partial<TransactionSplit> = {
                description: "Test Transaction",
                category_name: "Old Category",
                budget_name: undefined,
            };

            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(
                mockTransactionNoBudget as TransactionSplit,
                mockTransactionId,
                { category: "New Category" },
            );

            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    choices: expect.arrayContaining([
                        expect.objectContaining({
                            key: "a",
                            name: "Update all",
                            value: UpdateTransactionMode.Both,
                        }),
                        expect.objectContaining({
                            key: "c",
                            name: "Update only the category",
                            value: UpdateTransactionMode.Category,
                        }),
                        expect.objectContaining({
                            key: "x",
                            name: "Abort",
                            value: UpdateTransactionMode.Abort,
                        }),
                    ]),
                }),
            );
            // Should not have budget option
            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    choices: expect.not.arrayContaining([
                        expect.objectContaining({
                            key: "b",
                            name: "Update only the budget",
                        }),
                    ]),
                }),
            );
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
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                transactionId,
                { category: newCategory },
            );

            const expectedLink = `${mockBaseUrl}/transactions/show/${transactionId}`;
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${mockTransaction.description}\x1B]8;;\x1B\\`;

            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                }),
            );
        });

        it("should not include hyperlink when transaction ID is undefined", async () => {
            const newCategory = "New Category";
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                undefined,
                { category: newCategory },
            );

            // Should not contain ANSI escape sequences for hyperlinks
            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.not.stringContaining("\x1B]8;;"),
                }),
            );

            // Should contain the plain description
            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(mockTransaction.description as string),
                }),
            );
        });

        it("should include hyperlink with truncated description for long descriptions", async () => {
            const longDescription = "A".repeat(100);
            const mockTransactionWithLongDesc: Partial<TransactionSplit> = {
                description: longDescription,
                category_name: "Old Category",
            };
            const transactionId = "456";
            const newCategory = "New Category";
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(
                mockTransactionWithLongDesc as TransactionSplit,
                transactionId,
                { category: newCategory },
            );

            const expectedLink = `${mockBaseUrl}/transactions/show/${transactionId}`;
            const truncatedDescription = longDescription.substring(0, 47) + "...";
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${truncatedDescription}\x1B]8;;\x1B\\`;

            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                }),
            );
        });

        it("should construct correct transaction URL with different base URLs", async () => {
            const customBaseUrl = "https://firefly.example.com";
            const customService = new UserInputService(customBaseUrl);
            const transactionId = "789";
            const newBudget = "New Budget";
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Both);

            await customService.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                transactionId,
                { budget: newBudget },
            );

            const expectedLink = `${customBaseUrl}/transactions/show/${transactionId}`;
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${mockTransaction.description}\x1B]8;;\x1B\\`;

            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                }),
            );
        });

        it("should handle empty transaction ID as no hyperlink", async () => {
            const newCategory = "New Category";
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(
                mockTransaction as TransactionSplit,
                "",
                { category: newCategory },
            );

            // Empty string is falsy, so should not generate hyperlink
            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.not.stringContaining("\x1B]8;;"),
                }),
            );

            // Should contain the plain description
            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(mockTransaction.description as string),
                }),
            );
        });

        it("should properly format hyperlink with special characters in description", async () => {
            const specialDescTransaction: Partial<TransactionSplit> = {
                description: "Transaction with & < > \" ' special chars",
                category_name: "Old Category",
            };
            const transactionId = "999";
            const newCategory = "New Category";
            expandMock.mockResolvedValueOnce(UpdateTransactionMode.Both);

            await service.askToUpdateTransaction(
                specialDescTransaction as TransactionSplit,
                transactionId,
                { category: newCategory },
            );

            const expectedLink = `${mockBaseUrl}/transactions/show/${transactionId}`;
            const expectedHyperlink = `\x1B]8;;${expectedLink}\x1B\\${specialDescTransaction.description}\x1B]8;;\x1B\\`;

            expect(expandMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(expectedHyperlink),
                }),
            );
        });
    });
});
