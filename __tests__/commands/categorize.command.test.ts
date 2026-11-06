import { CategorizeCommand } from '../../src/commands/categorize.command.js';
import { AITransactionUpdateOrchestrator } from '../../src/services/ai-transaction-update-orchestrator.service.js';
import { CategorizeDisplayService } from '../../src/services/display/categorize-display.service.js';
import { jest } from '@jest/globals';
import { CategorizeMode, CategorizeStatus } from '../../src/types/enums.js';
import { TransactionValidationError } from '../../src/types/result.type.js';

const transactionError = (description: string): TransactionValidationError => ({
    field: 'category',
    message: 'Invalid category',
    userMessage: 'Invalid category',
    transactionId: '1',
    transactionDescription: description,
});

describe('CategorizeCommand', () => {
    let command: CategorizeCommand;
    let mockAIOrchestrator: jest.Mocked<AITransactionUpdateOrchestrator>;
    let mockDisplayService: jest.Mocked<CategorizeDisplayService>;

    beforeEach(() => {
        mockAIOrchestrator = {
            updateTransactionsByTag: jest.fn(),
        } as unknown as jest.Mocked<AITransactionUpdateOrchestrator>;

        mockDisplayService = {
            formatProcessingHeader: jest.fn().mockReturnValue('Processing header'),
            formatTagNotFound: jest.fn().mockReturnValue('Tag not found'),
            formatEmptyTag: jest.fn().mockReturnValue('Empty tag'),
            formatError: jest.fn().mockReturnValue('Error'),
        } as unknown as jest.Mocked<CategorizeDisplayService>;

        jest.spyOn(CategorizeDisplayService.prototype, 'formatProcessingHeader').mockImplementation(
            mockDisplayService.formatProcessingHeader
        );
        jest.spyOn(CategorizeDisplayService.prototype, 'formatTagNotFound').mockImplementation(
            mockDisplayService.formatTagNotFound
        );
        jest.spyOn(CategorizeDisplayService.prototype, 'formatEmptyTag').mockImplementation(
            mockDisplayService.formatEmptyTag
        );
        jest.spyOn(CategorizeDisplayService.prototype, 'formatError').mockImplementation(
            mockDisplayService.formatError
        );

        command = new CategorizeCommand(mockAIOrchestrator);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('execute', () => {
        it('should handle tag not found', async () => {
            const params = {
                tag: 'nonexistent-tag',
                updateMode: CategorizeMode.Both,
            };

            mockAIOrchestrator.updateTransactionsByTag.mockResolvedValue({
                status: CategorizeStatus.NO_TAG,
                transactionsUpdated: 0,
                errors: [],
            });

            await command.execute(params);

            expect(mockAIOrchestrator.updateTransactionsByTag).toHaveBeenCalledWith(
                params.tag,
                params.updateMode
            );
            expect(mockDisplayService.formatProcessingHeader).toHaveBeenCalledWith(
                params.tag,
                params.updateMode,
                false
            );
            expect(mockDisplayService.formatTagNotFound).toHaveBeenCalledWith(params.tag);
        });

        it('should handle empty tag', async () => {
            const params = {
                tag: 'empty-tag',
                updateMode: CategorizeMode.Both,
            };

            mockAIOrchestrator.updateTransactionsByTag.mockResolvedValue({
                status: CategorizeStatus.EMPTY_TAG,
                transactionsUpdated: 0,
                errors: [],
            });

            await command.execute(params);

            expect(mockAIOrchestrator.updateTransactionsByTag).toHaveBeenCalledWith(
                params.tag,
                params.updateMode
            );
            expect(mockDisplayService.formatProcessingHeader).toHaveBeenCalledWith(
                params.tag,
                params.updateMode,
                false
            );
            expect(mockDisplayService.formatEmptyTag).toHaveBeenCalledWith(params.tag);
        });

        it('should handle successful updates', async () => {
            const params = {
                tag: 'test-tag',
                updateMode: CategorizeMode.Both,
            };

            const results = {
                status: CategorizeStatus.HAS_RESULTS,
                transactionsUpdated: 5,
                errors: [],
            };

            mockAIOrchestrator.updateTransactionsByTag.mockResolvedValue(results);

            // Mock console.log to verify output
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            await command.execute(params);

            expect(mockAIOrchestrator.updateTransactionsByTag).toHaveBeenCalledWith(
                params.tag,
                params.updateMode
            );
            expect(mockDisplayService.formatProcessingHeader).toHaveBeenCalledWith(
                params.tag,
                params.updateMode,
                false
            );
            expect(consoleSpy).toHaveBeenCalledWith('\nUpdated 5 Transaction(s)!');

            consoleSpy.mockRestore();
        });

        it('should handle dry run mode', async () => {
            const params = {
                tag: 'test-tag',
                updateMode: CategorizeMode.Both,
                dryRun: true,
            };

            const results = {
                status: CategorizeStatus.HAS_RESULTS,
                transactionsUpdated: 3,
                errors: [],
            };

            mockAIOrchestrator.updateTransactionsByTag.mockResolvedValue(results);

            // Mock console.log to verify output
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

            await command.execute(params);

            expect(mockAIOrchestrator.updateTransactionsByTag).toHaveBeenCalledWith(
                params.tag,
                params.updateMode
            );
            expect(mockDisplayService.formatProcessingHeader).toHaveBeenCalledWith(
                params.tag,
                params.updateMode,
                true
            );
            expect(consoleSpy).toHaveBeenCalledWith('\n[DRYRUN] Updated 3 Transaction(s)!');

            consoleSpy.mockRestore();
        });

        it('should handle errors', async () => {
            const params = {
                tag: 'test-tag',
                updateMode: CategorizeMode.Both,
            };

            const error = new Error('Test error');
            mockAIOrchestrator.updateTransactionsByTag.mockRejectedValue(error);

            await expect(command.execute(params)).rejects.toThrow(error);
            expect(mockDisplayService.formatProcessingHeader).toHaveBeenCalledWith(
                params.tag,
                params.updateMode,
                false
            );
            expect(mockDisplayService.formatError).toHaveBeenCalledWith(error);
        });

        it('should display warning when some transactions fail to update', async () => {
            const params = {
                tag: 'test-tag',
                updateMode: CategorizeMode.Both,
            };

            const results = {
                status: CategorizeStatus.HAS_RESULTS,
                transactionsUpdated: 8,
                errors: [transactionError('a'), transactionError('b')],
            };

            mockAIOrchestrator.updateTransactionsByTag.mockResolvedValue(results);

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await command.execute(params);

            expect(consoleSpy).toHaveBeenCalledWith('\nUpdated 8 Transaction(s)!');
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('2 transaction(s) failed validation')
            );

            consoleSpy.mockRestore();
            consoleErrorSpy.mockRestore();
        });
    });
});
