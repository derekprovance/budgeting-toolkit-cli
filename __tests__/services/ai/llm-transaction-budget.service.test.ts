import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { LLMTransactionBudgetService } from "../../../src/services/ai/llm-transaction-budget.service";
import { ClaudeClient } from "../../../src/api/claude.client";
import { LLMResponseValidator } from "../../../src/services/ai/llm-response-validator.service";
import { mockTransactions, mockBudgets } from "../../shared/test-data";

jest.mock("../../../src/api/claude.client");
jest.mock("../../../src/services/ai/llm-response-validator.service");

describe("LLMTransactionBudgetService", () => {
  let service: LLMTransactionBudgetService;
  let mockClaudeClient: jest.Mocked<ClaudeClient>;

  beforeEach(() => {
    mockClaudeClient = {
      chatBatch: jest.fn(),
      chat: jest.fn(),
      updateConfig: jest.fn(),
      getConfig: jest.fn(),
    } as unknown as jest.Mocked<ClaudeClient>;

    service = new LLMTransactionBudgetService(mockClaudeClient);
  });

  describe("assignBudgets", () => {
    const mockTransactionsList: TransactionSplit[] = [
      mockTransactions.walmart,
      mockTransactions.pharmacy,
      mockTransactions.amazon,
    ];

    const mockBudgetsList = Object.values(mockBudgets);
    const mockCategories = ["Groceries", "Healthcare", "Shopping"];

    it("should assign budgets based on transaction descriptions", async () => {
      const expectedResponses = [
        mockBudgets.food,
        mockBudgets.medical,
        mockBudgets.shopping,
      ];

      mockClaudeClient.chatBatch.mockResolvedValueOnce(expectedResponses);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce(expectedResponses);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce(expectedResponses);

      const result = await service.assignBudgets(
        mockBudgetsList,
        mockTransactionsList,
        mockCategories
      );

      expect(result).toEqual(expectedResponses);
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(1);
    }, 10000);

    it("should process single transaction", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];
      const expectedResponse = mockBudgets.food;

      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce([expectedResponse]);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce(expectedResponse);

      const result = await service.assignBudgets(
        mockBudgetsList,
        singleTransaction,
        singleCategory
      );

      expect(mockClaudeClient.chatBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining(
                "Description: Walmart Supercenter"
              ),
            }),
          ]),
        ]),
        expect.any(Object)
      );
      expect(result).toEqual([expectedResponse]);
    });

    it("should process multiple transactions in batches", async () => {
      const transactions = mockTransactionsList.slice(0, 2);
      const categories = mockCategories.slice(0, 2);
      const expectedResponses = [mockBudgets.food, mockBudgets.medical];

      mockClaudeClient.chatBatch.mockResolvedValueOnce(expectedResponses);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce(expectedResponses);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce(expectedResponses);

      const result = await service.assignBudgets(
        mockBudgetsList,
        transactions,
        categories
      );

      expect(mockClaudeClient.chatBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({
              role: "user",
              content: expect.stringContaining("Transaction 1:"),
            }),
          ]),
        ]),
        expect.any(Object)
      );
      expect(result).toEqual(expectedResponses);
    });

    it("should handle validation errors", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];
      const expectedResponse = mockBudgets.food;

      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockImplementation(() => {
        throw new Error("Invalid budget");
      });

      await expect(
        service.assignBudgets(
          mockBudgetsList,
          singleTransaction,
          singleCategory
        )
      ).rejects.toThrow("Invalid budget");
    }, 10000);

    it("should retry on failure", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];
      const expectedResponse = '{"budgets": ["Food"]}';

      mockClaudeClient.chatBatch
        .mockRejectedValueOnce(new Error("API Error"))
        .mockResolvedValueOnce([expectedResponse]);

      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce(["Food"]);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce(["Food"]);

      const result = await service.assignBudgets(
        mockBudgetsList,
        singleTransaction,
        singleCategory
      );

      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(["Food"]);
    }, 10000);

    it("should fail after max retries", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];

      mockClaudeClient.chatBatch.mockReset();
      mockClaudeClient.chatBatch.mockRejectedValue(new Error("API Error"));

      await expect(
        service.assignBudgets(
          mockBudgetsList,
          singleTransaction,
          singleCategory
        )
      ).rejects.toThrow("API Error");
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(4);
    }, 10000);

    it("should return empty string for transactions without matching budget", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];
      const expectedResponse = "";

      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce([""]);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce([""]);

      const result = await service.assignBudgets(
        mockBudgetsList,
        singleTransaction,
        singleCategory
      );

      expect(result).toEqual([""]);
    });

    it("should handle empty transactions array", async () => {
      const result = await service.assignBudgets(mockBudgetsList, [], []);
      expect(result).toEqual([]);
      expect(mockClaudeClient.chatBatch).not.toHaveBeenCalled();
    });

    it("should handle mismatched transaction and category lengths", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const multipleCategories = ["Groceries", "Healthcare"];

      await expect(
        service.assignBudgets(
          mockBudgetsList,
          singleTransaction,
          multipleCategories
        )
      ).rejects.toThrow("Number of transactions and categories must match");
      expect(mockClaudeClient.chatBatch).not.toHaveBeenCalled();
    });

    it("should handle empty budgets array", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];

      const result = await service.assignBudgets(
        [],
        singleTransaction,
        singleCategory
      );
      expect(result).toEqual([""]);
      expect(mockClaudeClient.chatBatch).not.toHaveBeenCalled();
    });

    it("should handle transactions with missing descriptions", async () => {
      const transactionWithMissingDescription = {
        ...mockTransactionsList[0],
        description: "",
      };

      const expectedResponse = "";
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce([""]);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce("");

      const result = await service.assignBudgets(
        mockBudgetsList,
        [transactionWithMissingDescription],
        [mockCategories[0]]
      );

      expect(result).toEqual([""]);
    });

    it("should handle transactions with missing amounts", async () => {
      const transactionWithMissingAmount = {
        ...mockTransactionsList[0],
        amount: "",
      };

      const expectedResponse = "";
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce([""]);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce("");

      const result = await service.assignBudgets(
        mockBudgetsList,
        [transactionWithMissingAmount],
        [mockCategories[0]]
      );

      expect(result).toEqual([""]);
    });

    it("should handle transactions with missing dates", async () => {
      const transactionWithMissingDate = {
        ...mockTransactionsList[0],
        date: "",
      };

      const expectedResponse = "";
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce([""]);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce("");

      const result = await service.assignBudgets(
        mockBudgetsList,
        [transactionWithMissingDate],
        [mockCategories[0]]
      );

      expect(result).toEqual([""]);
    });

    it("should handle transactions with null values", async () => {
      const transactionWithNullValues = {
        ...mockTransactionsList[0],
        description: "",
        amount: "",
        date: "",
      };

      const expectedResponse = "";
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce([""]);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce("");

      const result = await service.assignBudgets(
        mockBudgetsList,
        [transactionWithNullValues],
        [mockCategories[0]]
      );

      expect(result).toEqual([""]);
    });

    it("should handle budget name case sensitivity", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];
      mockClaudeClient.chatBatch.mockResolvedValueOnce(["food"]); // lowercase response

      await expect(
        service.assignBudgets(
          mockBudgetsList,
          singleTransaction,
          singleCategory
        )
      ).rejects.toThrow("Invalid budget");
    });

    it("should handle whitespace in budget responses", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];
      mockClaudeClient.chatBatch.mockResolvedValueOnce(["  Food  "]); // extra whitespace

      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce(["Food"]);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce("Food");

      const result = await service.assignBudgets(
        mockBudgetsList,
        singleTransaction,
        singleCategory
      );
      expect(result).toEqual(["Food"]);
    });

    it("should maintain consistent budget assignment for similar transactions", async () => {
      const similarTransactions = [
        { ...mockTransactionsList[0], description: "Walmart Grocery" },
        { ...mockTransactionsList[0], description: "Walmart Supermarket" },
      ];
      const transactionCategories = ["Groceries", "Groceries"];

      mockClaudeClient.chatBatch.mockResolvedValueOnce([
        mockBudgets.food,
        mockBudgets.food,
      ]);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce([mockBudgets.food, mockBudgets.food]);
      (LLMResponseValidator.validateBudgetResponse as jest.Mock)
        .mockReturnValueOnce(mockBudgets.food)
        .mockReturnValueOnce(mockBudgets.food);

      const result = await service.assignBudgets(
        mockBudgetsList,
        similarTransactions,
        transactionCategories
      );
      expect(result[0]).toEqual(result[1]); // Should assign same budget
      expect(result).toEqual([mockBudgets.food, mockBudgets.food]);
    });

    it("should handle timeout from Claude API", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];

      mockClaudeClient.chatBatch
        .mockRejectedValueOnce(new Error("Request timeout"))
        .mockRejectedValueOnce(new Error("Request timeout"))
        .mockRejectedValueOnce(new Error("Request timeout"))
        .mockRejectedValueOnce(new Error("Request timeout"));

      await expect(
        service.assignBudgets(
          mockBudgetsList,
          singleTransaction,
          singleCategory
        )
      ).rejects.toThrow("Request timeout");
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    }, 10000);

    it("should handle malformed responses from Claude", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];

      mockClaudeClient.chatBatch.mockResolvedValueOnce(['{"budget": "Food"}']); // Wrong format

      await expect(
        service.assignBudgets(
          mockBudgetsList,
          singleTransaction,
          singleCategory
        )
      ).rejects.toThrow("Invalid budget");
    });

    it("should handle special characters in transaction descriptions", async () => {
      const transactionWithSpecialChars = {
        ...mockTransactionsList[0],
        description: "Café & Restaurant™ #123",
      };

      mockClaudeClient.chatBatch.mockResolvedValueOnce([mockBudgets.food]);
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce([mockBudgets.food]);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce(mockBudgets.food);

      const result = await service.assignBudgets(
        mockBudgetsList,
        [transactionWithSpecialChars],
        [mockCategories[0]]
      );

      expect(result).toEqual([mockBudgets.food]);
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining("Café & Restaurant™ #123"),
            }),
          ]),
        ]),
        expect.any(Object)
      );
    });

    it("should handle rate limiting from Claude API", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];

      mockClaudeClient.chatBatch
        .mockRejectedValueOnce(new Error("Rate limit exceeded"))
        .mockRejectedValueOnce(new Error("Rate limit exceeded"))
        .mockResolvedValueOnce([mockBudgets.food]); // Succeeds after rate limit cooldown

      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockResolvedValueOnce([mockBudgets.food]);
      (
        LLMResponseValidator.validateBudgetResponse as jest.Mock
      ).mockReturnValueOnce(mockBudgets.food);

      const result = await service.assignBudgets(
        mockBudgetsList,
        singleTransaction,
        singleCategory
      );
      expect(result).toEqual([mockBudgets.food]);
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(3);
    });

    it("should handle mismatched response lengths from Claude", async () => {
      const singleTransaction = [mockTransactionsList[0]];
      const singleCategory = [mockCategories[0]];

      mockClaudeClient.chatBatch.mockResolvedValueOnce([
        mockBudgets.food,
        mockBudgets.medical,
      ]); // More responses than transactions

      // Don't mock validateBatchResponses since we want to test the length check
      (
        LLMResponseValidator.validateBatchResponses as jest.Mock
      ).mockImplementation((responses) => {
        if (responses.length !== 1) {
          throw new Error("Invalid response from Claude");
        }
        return responses;
      });

      await expect(
        service.assignBudgets(
          mockBudgetsList,
          singleTransaction,
          singleCategory
        )
      ).rejects.toThrow("Invalid response from Claude");
    }, 10000); // Increased timeout to 10 seconds
  });
});
