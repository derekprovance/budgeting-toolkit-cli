import { UpdateTransactionsCommand } from "../../src/commands/update-transaction.command";
import { UpdateTransactionService } from "../../src/services/update-transaction.service";
import { UpdateTransactionMode } from "../../src/types/enum/update-transaction-mode.enum";
import { UpdateTransactionStatus } from "../../src/types/enum/update-transaction-status.enum";
import { UpdateTransactionDisplayService } from "../../src/services/display/update-transaction-display.service";

jest.mock("../../src/services/update-transaction.service");
jest.mock("../../src/services/display/update-transaction-display.service");

describe("UpdateTransactionsCommand", () => {
    let command: UpdateTransactionsCommand;
    let mockUpdateService: jest.Mocked<UpdateTransactionService>;
    let mockDisplayService: jest.Mocked<UpdateTransactionDisplayService>;

    beforeEach(() => {
        mockUpdateService = {
            updateTransactionsByTag: jest.fn(),
        } as unknown as jest.Mocked<UpdateTransactionService>;

        mockDisplayService = {
            formatProcessingHeader: jest
                .fn()
                .mockReturnValue("Processing header"),
            formatTagNotFound: jest.fn().mockReturnValue("Tag not found"),
            formatEmptyTag: jest.fn().mockReturnValue("Empty tag"),
            formatError: jest.fn().mockReturnValue("Error"),
        } as unknown as jest.Mocked<UpdateTransactionDisplayService>;

        jest.spyOn(
            UpdateTransactionDisplayService.prototype,
            "formatProcessingHeader",
        ).mockImplementation(mockDisplayService.formatProcessingHeader);
        jest.spyOn(
            UpdateTransactionDisplayService.prototype,
            "formatTagNotFound",
        ).mockImplementation(mockDisplayService.formatTagNotFound);
        jest.spyOn(
            UpdateTransactionDisplayService.prototype,
            "formatEmptyTag",
        ).mockImplementation(mockDisplayService.formatEmptyTag);
        jest.spyOn(
            UpdateTransactionDisplayService.prototype,
            "formatError",
        ).mockImplementation(mockDisplayService.formatError);

        command = new UpdateTransactionsCommand(mockUpdateService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("execute", () => {
        it("should handle tag not found", async () => {
            const params = {
                tag: "nonexistent-tag",
                updateMode: UpdateTransactionMode.Both,
            };

            mockUpdateService.updateTransactionsByTag.mockResolvedValue({
                status: UpdateTransactionStatus.NO_TAG,
            });

            await command.execute(params);

            expect(
                mockUpdateService.updateTransactionsByTag,
            ).toHaveBeenCalledWith(params.tag, params.updateMode, undefined);
            expect(
                mockDisplayService.formatProcessingHeader,
            ).toHaveBeenCalledWith(params.tag, params.updateMode, undefined);
            expect(mockDisplayService.formatTagNotFound).toHaveBeenCalledWith(
                params.tag,
            );
        });

        it("should handle empty tag", async () => {
            const params = {
                tag: "empty-tag",
                updateMode: UpdateTransactionMode.Both,
            };

            mockUpdateService.updateTransactionsByTag.mockResolvedValue({
                status: UpdateTransactionStatus.EMPTY_TAG,
            });

            await command.execute(params);

            expect(
                mockUpdateService.updateTransactionsByTag,
            ).toHaveBeenCalledWith(params.tag, params.updateMode, undefined);
            expect(
                mockDisplayService.formatProcessingHeader,
            ).toHaveBeenCalledWith(params.tag, params.updateMode, undefined);
            expect(mockDisplayService.formatEmptyTag).toHaveBeenCalledWith(
                params.tag,
            );
        });

        it("should handle successful updates", async () => {
            const params = {
                tag: "test-tag",
                updateMode: UpdateTransactionMode.Both,
            };

            const results = {
                status: UpdateTransactionStatus.HAS_RESULTS,
            };

            mockUpdateService.updateTransactionsByTag.mockResolvedValue(
                results,
            );

            await command.execute(params);

            expect(
                mockUpdateService.updateTransactionsByTag,
            ).toHaveBeenCalledWith(params.tag, params.updateMode, undefined);
            expect(
                mockDisplayService.formatProcessingHeader,
            ).toHaveBeenCalledWith(params.tag, params.updateMode, undefined);
            // Command now returns after successful updates without displaying them
        });

        it("should handle dry run mode", async () => {
            const params = {
                tag: "test-tag",
                updateMode: UpdateTransactionMode.Both,
                dryRun: true,
            };

            const results = {
                status: UpdateTransactionStatus.HAS_RESULTS,
            };

            mockUpdateService.updateTransactionsByTag.mockResolvedValue(
                results,
            );

            await command.execute(params);

            expect(
                mockUpdateService.updateTransactionsByTag,
            ).toHaveBeenCalledWith(params.tag, params.updateMode, true);
            expect(
                mockDisplayService.formatProcessingHeader,
            ).toHaveBeenCalledWith(params.tag, params.updateMode, true);
            // Command now returns after successful updates without displaying them
        });

        it("should handle errors", async () => {
            const params = {
                tag: "test-tag",
                updateMode: UpdateTransactionMode.Both,
            };

            const error = new Error("Test error");
            mockUpdateService.updateTransactionsByTag.mockRejectedValue(error);

            await expect(command.execute(params)).rejects.toThrow(error);
            expect(
                mockDisplayService.formatProcessingHeader,
            ).toHaveBeenCalledWith(params.tag, params.updateMode, undefined);
            expect(mockDisplayService.formatError).toHaveBeenCalledWith(error);
        });
    });
});
