import { UpdateTransactionsCommand } from "../../src/commands/update-transaction.command";
import { UpdateTransactionService } from "../../src/services/update-transaction.service";
import { UpdateTransactionMode } from "../../src/types/enum/update-transaction-mode.enum";
import { UpdateTransactionStatus } from "../../src/types/enum/update-transaction-status.enum";
import { TransactionService } from "../../src/services/core/transaction.service";
import { CategoryService } from "../../src/services/core/category.service";
import { BudgetService } from "../../src/services/core/budget.service";
import { LLMTransactionProcessingService } from "../../src/services/ai/llm-transaction-processing.service";
import { FireflyApiClient } from "@derekprovance/firefly-iii-sdk";
import { LLMTransactionCategoryService } from "../../src/services/ai/llm-transaction-category.service";
import { LLMTransactionBudgetService } from "../../src/services/ai/llm-transaction-budget.service";
import { ClaudeClient } from "../../src/api/claude.client";
import { TransactionPropertyService } from "../../src/services/core/transaction-property.service";
import { ExcludedTransactionService } from "../../src/services/excluded-transaction.service";

jest.mock("../../src/services/update-transaction.service");
jest.mock("../../src/services/core/transaction.service");
jest.mock("../../src/services/core/category.service");
jest.mock("../../src/services/core/budget.service");
jest.mock("../../src/services/ai/llm-transaction-processing.service");
jest.mock("../../src/services/ai/llm-transaction-category.service");
jest.mock("../../src/services/ai/llm-transaction-budget.service");
jest.mock("../../src/api/claude.client");
jest.mock("../../src/services/core/transaction-property.service");
jest.mock("../../src/services/excluded-transaction.service");
jest.mock("@derekprovance/firefly-iii-sdk");

describe("UpdateTransactionsCommand", () => {
  let command: UpdateTransactionsCommand;
  let mockUpdateService: jest.Mocked<UpdateTransactionService>;
  let mockTransactionService: jest.Mocked<TransactionService>;
  let mockCategoryService: jest.Mocked<CategoryService>;
  let mockBudgetService: jest.Mocked<BudgetService>;
  let mockLLMService: jest.Mocked<LLMTransactionProcessingService>;
  let mockApiClient: jest.Mocked<FireflyApiClient>;
  let mockLLMCategoryService: jest.Mocked<LLMTransactionCategoryService>;
  let mockLLMBudgetService: jest.Mocked<LLMTransactionBudgetService>;
  let mockClaudeClient: jest.Mocked<ClaudeClient>;
  let mockTransactionPropertyService: jest.Mocked<TransactionPropertyService>;
  let mockExcludedTransactionService: jest.Mocked<ExcludedTransactionService>;

  beforeEach(() => {
    mockApiClient = new FireflyApiClient({ 
      baseUrl: "http://localhost:8080",
      apiToken: "test-token"
    }) as jest.Mocked<FireflyApiClient>;
    mockClaudeClient = new ClaudeClient({}) as jest.Mocked<ClaudeClient>;
    mockExcludedTransactionService = new ExcludedTransactionService() as jest.Mocked<ExcludedTransactionService>;
    mockTransactionPropertyService = new TransactionPropertyService(mockExcludedTransactionService) as jest.Mocked<TransactionPropertyService>;
    mockTransactionService = new TransactionService(mockApiClient) as jest.Mocked<TransactionService>;
    mockCategoryService = new CategoryService(mockApiClient) as jest.Mocked<CategoryService>;
    mockBudgetService = new BudgetService(mockApiClient) as jest.Mocked<BudgetService>;
    mockLLMCategoryService = new LLMTransactionCategoryService(mockClaudeClient) as jest.Mocked<LLMTransactionCategoryService>;
    mockLLMBudgetService = new LLMTransactionBudgetService(mockClaudeClient) as jest.Mocked<LLMTransactionBudgetService>;
    mockLLMService = new LLMTransactionProcessingService(
      mockLLMCategoryService,
      mockLLMBudgetService
    ) as jest.Mocked<LLMTransactionProcessingService>;
    mockUpdateService = new UpdateTransactionService(
      mockTransactionService,
      mockCategoryService,
      mockBudgetService,
      mockLLMService,
      mockTransactionPropertyService,
      true,
      false
    ) as jest.Mocked<UpdateTransactionService>;
    command = new UpdateTransactionsCommand(mockUpdateService);
  });

  describe("execute", () => {
    it("should handle tag not found", async () => {
      const params = {
        tag: "nonexistent-tag",
        updateMode: UpdateTransactionMode.Both
      };

      mockUpdateService.updateTransactionsByTag.mockResolvedValue({
        status: UpdateTransactionStatus.NO_TAG,
        totalTransactions: 0,
        data: []
      });

      await command.execute(params);

      expect(mockUpdateService.updateTransactionsByTag).toHaveBeenCalledWith(
        params.tag,
        params.updateMode
      );
    });

    it("should handle empty tag", async () => {
      const params = {
        tag: "empty-tag",
        updateMode: UpdateTransactionMode.Both
      };

      mockUpdateService.updateTransactionsByTag.mockResolvedValue({
        status: UpdateTransactionStatus.EMPTY_TAG,
        totalTransactions: 0,
        data: []
      });

      await command.execute(params);

      expect(mockUpdateService.updateTransactionsByTag).toHaveBeenCalledWith(
        params.tag,
        params.updateMode
      );
    });

    it("should handle successful updates", async () => {
      const params = {
        tag: "test-tag",
        updateMode: UpdateTransactionMode.Both
      };

      const results = {
        status: UpdateTransactionStatus.HAS_RESULTS,
        totalTransactions: 2,
        data: [
          {
            name: "Transaction 1",
            category: "Old Category",
            updatedCategory: "New Category"
          },
          {
            name: "Transaction 2",
            budget: "Old Budget",
            updatedBudget: "New Budget"
          }
        ]
      };

      mockUpdateService.updateTransactionsByTag.mockResolvedValue(results);

      await command.execute(params);

      expect(mockUpdateService.updateTransactionsByTag).toHaveBeenCalledWith(
        params.tag,
        params.updateMode
      );
    });

    it("should handle processing errors", async () => {
      const params = {
        tag: "test-tag",
        updateMode: UpdateTransactionMode.Both
      };

      const error = new Error("Processing failed");
      mockUpdateService.updateTransactionsByTag.mockRejectedValue(error);

      await expect(command.execute(params)).rejects.toThrow("Processing failed");
      expect(mockUpdateService.updateTransactionsByTag).toHaveBeenCalledWith(
        params.tag,
        params.updateMode
      );
    });
  });
}); 