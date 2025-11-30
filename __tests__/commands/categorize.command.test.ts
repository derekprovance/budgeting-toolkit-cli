import { CategorizeCommand } from '../../src/commands/categorize.command.js';
import { AITransactionUpdateOrchestrator } from '../../src/services/ai-transaction-update-orchestrator.service.js';
import { CategorizeMode } from '../../src/types/enum/categorize-mode.enum.js';
import { CategorizeStatus } from '../../src/types/enum/categorize-status.enum.js';
import { CategorizeDisplayService } from '../../src/services/display/categorize-display.service.js';
import { jest } from '@jest/globals';

jest.mock('../../src/services/ai-transaction-update-orchestrator.service');
jest.mock('../../src/services/display/categorize-display.service');

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

        jest.spyOn(
            CategorizeDisplayService.prototype,
            'formatProcessingHeader'
        ).mockImplementation(mockDisplayService.formatProcessingHeader);
        jest.spyOn(
            CategorizeDisplayService.prototype,
            'formatTagNotFound'
        ).mockImplementation(mockDisplayService.formatTagNotFound);
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
            });

            await command.execute(params);

            expect(mockAIOrchestrator.updateTransactionsByTag).toHaveBeenCalledWith(
                params.tag,
                params.updateMode,
                false
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
            });

            await command.execute(params);

            expect(mockAIOrchestrator.updateTransactionsByTag).toHaveBeenCalledWith(
                params.tag,
                params.updateMode,
                false
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
            };

            mockAIOrchestrator.updateTransactionsByTag.mockResolvedValue(results);

            // Mock console.log to verify output
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await command.execute(params);

            expect(mockAIOrchestrator.updateTransactionsByTag).toHaveBeenCalledWith(
                params.tag,
                params.updateMode,
                false
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
            };

            mockAIOrchestrator.updateTransactionsByTag.mockResolvedValue(results);

            // Mock console.log to verify output
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await command.execute(params);

            expect(mockAIOrchestrator.updateTransactionsByTag).toHaveBeenCalledWith(
                params.tag,
                params.updateMode,
                true
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
    });
});
