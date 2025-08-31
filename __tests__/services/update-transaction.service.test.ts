// Move all jest.mock(...) calls to the top, before any imports
jest.mock("../../src/logger", () => ({
    logger: {
        debug: (...args: unknown[]) => console.log("[logger.debug]", ...args),
        info: (...args: unknown[]) => console.log("[logger.info]", ...args),
        warn: (...args: unknown[]) => console.log("[logger.warn]", ...args),
        error: (...args: unknown[]) => console.log("[logger.error]", ...args),
        trace: (...args: unknown[]) => console.log("[logger.trace]", ...args),
    },
}));

jest.mock("../../src/services/core/transaction.service");
jest.mock("../../src/services/core/category.service");
jest.mock("../../src/services/core/budget.service");
jest.mock("../../src/services/ai/llm-transaction-processing.service");
jest.mock("../../src/services/core/transaction-property.service");
jest.mock("../../src/services/core/transaction-validator.service");
jest.mock("../../src/services/core/transaction-updater.service");

import { UpdateTransactionService } from "../../src/services/update-transaction.service";
import { TransactionService } from "../../src/services/core/transaction.service";
import { CategoryService } from "../../src/services/core/category.service";
import { BudgetService } from "../../src/services/core/budget.service";
import { LLMTransactionProcessingService } from "../../src/services/ai/llm-transaction-processing.service";
import { TransactionPropertyService } from "../../src/services/core/transaction-property.service";
import { TransactionValidatorService } from "../../src/services/core/transaction-validator.service";
import { TransactionUpdaterService } from "../../src/services/core/transaction-updater.service";
import { UpdateTransactionMode } from "../../src/types/enum/update-transaction-mode.enum";
import { UpdateTransactionStatus } from "../../src/types/enum/update-transaction-status.enum";
import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { Category } from "@derekprovance/firefly-iii-sdk";
import { BudgetRead } from "@derekprovance/firefly-iii-sdk";
import { createMockTransaction } from "../shared/test-data";

describe("UpdateTransactionService", () => {
    let service: UpdateTransactionService;
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockCategoryService: jest.Mocked<CategoryService>;
    let mockBudgetService: jest.Mocked<BudgetService>;
    let mockLLMService: jest.Mocked<LLMTransactionProcessingService>;
    let mockPropertyService: jest.Mocked<TransactionPropertyService>;
    let mockValidator: jest.Mocked<TransactionValidatorService>;
    let mockUpdater: jest.Mocked<TransactionUpdaterService>;
    let mockTransactions: Partial<TransactionSplit>[];
    let mockAIResults: { [key: string]: { category: string; budget: string } };

    const mockCategories: Partial<Category>[] = [
        { name: "New Category 1" },
        { name: "New Category 2" },
    ];

    const mockBudgets: Partial<BudgetRead>[] = [
        { id: "1", type: "budget", attributes: { name: "New Budget 1" } },
        { id: "2", type: "budget", attributes: { name: "New Budget 2" } },
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        mockTransactions = [
            {
                transaction_journal_id: "1",
                description: "Test Transaction 1",
                amount: "100.00",
                category_name: "Old Category",
                budget_id: "1",
                budget_name: "Old Budget",
                type: "withdrawal",
                date: "2024-03-01",
                source_id: "1",
                destination_id: "2",
            },
            {
                transaction_journal_id: "2",
                description: "Test Transaction 2",
                amount: "200.00",
                category_name: "Old Category",
                budget_id: "2",
                budget_name: "Old Budget",
                type: "withdrawal",
                date: "2024-03-01",
                source_id: "1",
                destination_id: "2",
            },
        ];

        // Debug log for test isolation
        // console.log('beforeEach mockTransactions:', mockTransactions.length, JSON.stringify(mockTransactions));

        mockAIResults = {
            "1": { category: "New Category 1", budget: "New Budget 1" },
            "2": { category: "New Category 2", budget: "New Budget 2" },
        };

        mockTransactionService = {
            tagExists: jest.fn(),
            getTransactionsByTag: jest
                .fn()
                .mockResolvedValue(mockTransactions as TransactionSplit[]),
            updateTransaction: jest.fn(),
        } as unknown as jest.Mocked<TransactionService>;

        mockCategoryService = {
            getCategories: jest.fn(),
        } as unknown as jest.Mocked<CategoryService>;

        mockBudgetService = {
            getBudgets: jest.fn(),
        } as unknown as jest.Mocked<BudgetService>;

        mockLLMService = {
            processTransactions: jest.fn(),
        } as unknown as jest.Mocked<LLMTransactionProcessingService>;

        mockPropertyService = {
            isBill: jest.fn(),
            isTransfer: jest.fn(),
            isDeposit: jest.fn(),
        } as unknown as jest.Mocked<TransactionPropertyService>;

        mockValidator = {
            shouldProcessTransaction: jest.fn(),
            shouldSetBudget: jest.fn(),
            validateTransactionData: jest.fn(),
            categoryOrBudgetChanged: jest.fn(),
            transactionPropertyService: mockPropertyService,
        } as unknown as jest.Mocked<TransactionValidatorService>;

        mockUpdater = {
            updateTransaction: jest
                .fn()
                .mockImplementation((transaction, aiResults) => {
                    // Return the transaction with updated category and budget
                    const journalId = transaction.transaction_journal_id!;
                    const aiResult = aiResults[journalId];
                    const result = {
                        ...transaction,
                        category_name:
                            aiResult?.category || transaction.category_name,
                        budget_name:
                            aiResult?.budget || transaction.budget_name,
                    };
                    return Promise.resolve(result);
                }),
        } as unknown as jest.Mocked<TransactionUpdaterService>;

        // Mock the services directly
        jest.spyOn(
            TransactionValidatorService.prototype,
            "shouldProcessTransaction",
        ).mockImplementation(mockValidator.shouldProcessTransaction);
        jest.spyOn(
            TransactionValidatorService.prototype,
            "shouldSetBudget",
        ).mockImplementation(mockValidator.shouldSetBudget);
        jest.spyOn(
            TransactionValidatorService.prototype,
            "validateTransactionData",
        ).mockImplementation(mockValidator.validateTransactionData);
        jest.spyOn(
            TransactionValidatorService.prototype,
            "categoryOrBudgetChanged",
        ).mockImplementation(mockValidator.categoryOrBudgetChanged);

        // Mock TransactionUpdaterService constructor
        (TransactionUpdaterService as jest.Mock).mockImplementation(
            () => mockUpdater,
        );

        service = new UpdateTransactionService(
            mockTransactionService,
            mockCategoryService,
            mockBudgetService,
            mockLLMService,
            mockValidator,
            false,
            false,
        );

        // Assert that the service is using the correct mock instance
        // (This will throw if not, helping us diagnose the issue)
        expect(
            (service as unknown as { transactionService: TransactionService })
                .transactionService,
        ).toBe(mockTransactionService);

        mockValidator.shouldProcessTransaction.mockReturnValue(true);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("updateTransactionsByTag", () => {
        it("should return NO_TAG status when tag does not exist", async () => {
            mockTransactionService.tagExists.mockResolvedValue(false);

            const result = await service.updateTransactionsByTag(
                "nonexistent",
                UpdateTransactionMode.Both,
            );

            expect(result.status).toBe(UpdateTransactionStatus.NO_TAG);
            expect(result.totalTransactions).toBe(0);
            expect(result.data).toEqual([]);
        });

        it("should return EMPTY_TAG status when no transactions found", async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([]);

            const result = await service.updateTransactionsByTag(
                "empty",
                UpdateTransactionMode.Both,
            );

            expect(result.status).toBe(UpdateTransactionStatus.EMPTY_TAG);
            expect(result.totalTransactions).toBe(0);
            expect(result.data).toEqual([]);
        });

        it("should process transactions and return HAS_RESULTS status", async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[],
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as Category[],
            );
            mockBudgetService.getBudgets.mockResolvedValue(
                mockBudgets as BudgetRead[],
            );
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            // Dynamically generate mockAIResults to match filtered transactions
            const filtered = (mockTransactions as TransactionSplit[]).filter(
                (t) => mockValidator.shouldProcessTransaction(t, false),
            );
            const dynamicAIResults = Object.fromEntries(
                filtered.map((t, idx) => [
                    t.transaction_journal_id!,
                    {
                        category: `New Category ${idx + 1}`,
                        budget: `New Budget ${idx + 1}`,
                    },
                ]),
            );
            mockLLMService.processTransactions.mockResolvedValue(
                dynamicAIResults,
            );
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUpdater.updateTransaction.mockImplementation(
                async (transaction, aiResults) => {
                    const journalId = transaction.transaction_journal_id!;
                    const aiResult = aiResults[journalId];
                    const result = {
                        ...transaction,
                        category_name:
                            aiResult?.category || transaction.category_name,
                        budget_name:
                            aiResult?.budget || transaction.budget_name,
                    };
                    return Promise.resolve(result);
                },
            );

            const result = await service.updateTransactionsByTag(
                "test",
                UpdateTransactionMode.Both,
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(result.totalTransactions).toBe(mockTransactions.length);
            expect(result.data).toHaveLength(mockTransactions.length);
            expect(mockUpdater.updateTransaction).toHaveBeenCalledTimes(
                mockTransactions.length,
            );
        });

        it("should handle processing failures and return PROCESSING_FAILED status", async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockRejectedValue(
                new Error("Processing failed"),
            );

            const result = await service.updateTransactionsByTag(
                "test",
                UpdateTransactionMode.Both,
            );

            expect(result.status).toBe(
                UpdateTransactionStatus.PROCESSING_FAILED,
            );
            expect(result.totalTransactions).toBe(0);
            expect(result.data).toEqual([]);
            expect(result.error).toBe("Processing failed");
        });

        it("should skip transactions that are transfers", async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[],
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as Category[],
            );
            mockBudgetService.getBudgets.mockResolvedValue(
                mockBudgets as BudgetRead[],
            );
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(false);

            const result = await service.updateTransactionsByTag(
                "test",
                UpdateTransactionMode.Both,
            );

            expect(result.status).toBe(UpdateTransactionStatus.EMPTY_TAG);
            expect(result.totalTransactions).toBe(0);
            expect(result.data).toHaveLength(0);
            expect(mockUpdater.updateTransaction).not.toHaveBeenCalled();
        });

        it("should handle category-only update mode", async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[],
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as Category[],
            );
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUpdater.updateTransaction.mockResolvedValue(
                mockTransactions[0] as TransactionSplit,
            );

            const result = await service.updateTransactionsByTag(
                "test",
                UpdateTransactionMode.Category,
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(mockBudgetService.getBudgets).not.toHaveBeenCalled();
            expect(mockUpdater.updateTransaction).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                expect.any(Array),
                [],
            );
        });

        it("should handle budget-only update mode", async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[],
            );
            mockBudgetService.getBudgets.mockResolvedValue(
                mockBudgets as BudgetRead[],
            );
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);
            mockUpdater.updateTransaction.mockResolvedValue(
                mockTransactions[0] as TransactionSplit,
            );

            const result = await service.updateTransactionsByTag(
                "test",
                UpdateTransactionMode.Budget,
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(mockCategoryService.getCategories).not.toHaveBeenCalled();
            expect(mockUpdater.updateTransaction).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                [],
                expect.any(Array),
            );
        });

        it("should handle dry run mode correctly", async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[],
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as Category[],
            );
            mockBudgetService.getBudgets.mockResolvedValue(
                mockBudgets as BudgetRead[],
            );
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const serviceWithDryRun = new UpdateTransactionService(
                mockTransactionService,
                mockCategoryService,
                mockBudgetService,
                mockLLMService,
                mockValidator,
                false,
                false,
                true,
            );

            const result = await serviceWithDryRun.updateTransactionsByTag(
                "test",
                UpdateTransactionMode.Both,
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(result.totalTransactions).toBe(mockTransactions.length);
            expect(result.data).toHaveLength(mockTransactions.length);
            expect(
                mockTransactionService.updateTransaction,
            ).not.toHaveBeenCalled();
        });

        it("should show proposed changes in dry run mode", async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[],
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as Category[],
            );
            mockBudgetService.getBudgets.mockResolvedValue(
                mockBudgets as BudgetRead[],
            );
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const serviceWithDryRun = new UpdateTransactionService(
                mockTransactionService,
                mockCategoryService,
                mockBudgetService,
                mockLLMService,
                mockValidator,
                false,
                false,
                true,
            );

            const result = await serviceWithDryRun.updateTransactionsByTag(
                "test",
                UpdateTransactionMode.Both,
            );

            expect(result.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: "Test Transaction 1",
                        category: "New Category 1",
                        updatedCategory: "New Category 1",
                        budget: "New Budget 1",
                        updatedBudget: "New Budget 1",
                    }),
                    expect.objectContaining({
                        name: "Test Transaction 2",
                        category: "New Category 2",
                        updatedCategory: "New Category 2",
                        budget: "New Budget 2",
                        updatedBudget: "New Budget 2",
                    }),
                ]),
            );
        });

        it("should combine dry run with no confirmation", async () => {
            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue(
                mockTransactions as TransactionSplit[],
            );
            mockCategoryService.getCategories.mockResolvedValue(
                mockCategories as Category[],
            );
            mockBudgetService.getBudgets.mockResolvedValue(
                mockBudgets as BudgetRead[],
            );
            mockLLMService.processTransactions.mockResolvedValue(mockAIResults);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockValidator.validateTransactionData.mockReturnValue(true);
            mockValidator.categoryOrBudgetChanged.mockReturnValue(true);

            const serviceWithBoth = new UpdateTransactionService(
                mockTransactionService,
                mockCategoryService,
                mockBudgetService,
                mockLLMService,
                mockValidator,
                false,
                true,
                true,
            );

            const result = await serviceWithBoth.updateTransactionsByTag(
                "test",
                UpdateTransactionMode.Both,
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(result.totalTransactions).toBe(mockTransactions.length);
            expect(result.data).toHaveLength(mockTransactions.length);
            expect(
                mockTransactionService.updateTransaction,
            ).not.toHaveBeenCalled();
        });

        it("should handle successful updates", async () => {
            const tag = "test-tag";
            const updateMode = UpdateTransactionMode.Both;
            const dryRun = false;

            const mockTransaction = createMockTransaction({
                transaction_journal_id: "1",
                description: "Test Transaction",
                amount: "100.00",
            });

            const mockCategory: Category = {
                name: "Test Category",
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
            };

            const mockBudget: BudgetRead = {
                id: "1",
                type: "budget",
                attributes: {
                    name: "Test Budget",
                    active: true,
                    order: 0,
                    created_at: "2024-01-01T00:00:00Z",
                    updated_at: "2024-01-01T00:00:00Z",
                    spent: [],
                    auto_budget_type: null,
                    auto_budget_currency_id: null,
                    auto_budget_currency_code: null,
                    auto_budget_amount: null,
                    auto_budget_period: null,
                },
            };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                mockTransaction,
            ]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([mockCategory]);
            mockBudgetService.getBudgets.mockResolvedValue([mockBudget]);
            mockLLMService.processTransactions.mockResolvedValue({
                "1": { category: "New Category", budget: "New Budget" },
            });
            mockUpdater.updateTransaction.mockResolvedValue(mockTransaction);

            const result = await service.updateTransactionsByTag(
                tag,
                updateMode,
                dryRun,
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(result.totalTransactions).toBe(1);
            expect(result.data).toHaveLength(1);
            expect(mockTransactionService.tagExists).toHaveBeenCalledWith(tag);
            expect(
                mockTransactionService.getTransactionsByTag,
            ).toHaveBeenCalledWith(tag);
            expect(mockValidator.shouldProcessTransaction).toHaveBeenCalledWith(
                mockTransaction,
                false,
            );
            expect(mockCategoryService.getCategories).toHaveBeenCalled();
            expect(mockBudgetService.getBudgets).toHaveBeenCalled();
            expect(mockLLMService.processTransactions).toHaveBeenCalledWith(
                [mockTransaction],
                [mockCategory.name],
                [mockBudget.attributes.name],
            );
            expect(mockUpdater.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                { "1": { category: "New Category", budget: "New Budget" } },
                [mockCategory],
                [mockBudget],
            );
        });

        it("should handle dry run mode", async () => {
            const tag = "test-tag";
            const updateMode = UpdateTransactionMode.Both;
            const dryRun = true;

            const mockTransaction = createMockTransaction({
                transaction_journal_id: "1",
                description: "Test Transaction",
                amount: "100.00",
            });

            const mockCategory: Category = {
                name: "Test Category",
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
            };

            const mockBudget: BudgetRead = {
                id: "1",
                type: "budget",
                attributes: {
                    name: "Test Budget",
                    active: true,
                    order: 0,
                    created_at: "2024-01-01T00:00:00Z",
                    updated_at: "2024-01-01T00:00:00Z",
                    spent: [],
                    auto_budget_type: null,
                    auto_budget_currency_id: null,
                    auto_budget_currency_code: null,
                    auto_budget_amount: null,
                    auto_budget_period: null,
                },
            };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                mockTransaction,
            ]);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([mockCategory]);
            mockBudgetService.getBudgets.mockResolvedValue([mockBudget]);
            mockLLMService.processTransactions.mockResolvedValue({
                "1": { category: "New Category", budget: "New Budget" },
            });
            mockUpdater.updateTransaction.mockResolvedValue(mockTransaction);

            const result = await service.updateTransactionsByTag(
                tag,
                updateMode,
                dryRun,
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(result.totalTransactions).toBe(1);
            expect(result.data).toHaveLength(1);
            expect(mockTransactionService.tagExists).toHaveBeenCalledWith(tag);
            expect(
                mockTransactionService.getTransactionsByTag,
            ).toHaveBeenCalledWith(tag);
            expect(mockValidator.shouldProcessTransaction).toHaveBeenCalledWith(
                mockTransaction,
                false,
            );
            expect(mockCategoryService.getCategories).toHaveBeenCalled();
            expect(mockBudgetService.getBudgets).toHaveBeenCalled();
            expect(mockLLMService.processTransactions).toHaveBeenCalledWith(
                [mockTransaction],
                [mockCategory.name],
                [mockBudget.attributes.name],
            );
            expect(mockUpdater.updateTransaction).toHaveBeenCalledWith(
                mockTransaction,
                { "1": { category: "New Category", budget: "New Budget" } },
                [mockCategory],
                [mockBudget],
            );
        });

        it("should skip transactions with missing journal IDs during processing", async () => {
            const tag = "test-tag";
            const updateMode = UpdateTransactionMode.Both;

            const transactionWithoutId = {
                transaction_journal_id: undefined,
                description: "Transaction without ID",
                amount: "100.00",
            };

            mockTransactionService.tagExists.mockResolvedValue(true);
            mockTransactionService.getTransactionsByTag.mockResolvedValue([
                transactionWithoutId,
            ] as any);
            mockValidator.shouldProcessTransaction.mockReturnValue(true);
            mockCategoryService.getCategories.mockResolvedValue([]);
            mockBudgetService.getBudgets.mockResolvedValue([]);

            // Mock the LLM service to return exactly one result (to match transaction count)
            // The key doesn't matter since the transaction has no journal ID
            mockLLMService.processTransactions.mockResolvedValue({
                dummy: { category: "Test Category", budget: "Test Budget" },
            });

            const result = await service.updateTransactionsByTag(
                tag,
                updateMode,
            );

            expect(result.status).toBe(UpdateTransactionStatus.HAS_RESULTS);
            expect(result.totalTransactions).toBe(1);
            expect(result.data).toHaveLength(0); // No data because transaction was skipped due to missing ID
            expect(mockUpdater.updateTransaction).not.toHaveBeenCalled();
        });
    });
});
