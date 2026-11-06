import { CategorizeCommand } from '../../src/commands/categorize.command.js';
import { AITransactionUpdateOrchestrator } from '../../src/services/ai-transaction-update-orchestrator.service.js';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CategorizeMode, CategorizeStatus } from '../../src/types/enums.js';
import { TransactionValidationError } from '../../src/types/result.type.js';
import { CategorizeStatusDto } from '../../src/types/dto/categorize-status.dto.js';
import { partialMock } from '../shared/mocks.js';

// chalk is not mocked: FORCE_COLOR=0 (__tests__/setup/env.ts) keeps output plain.

const transactionError = (description: string): TransactionValidationError => ({
    field: 'category',
    message: 'Invalid category',
    userMessage: 'Invalid category',
    transactionId: '1',
    transactionDescription: description,
});

describe('CategorizeCommand', () => {
    let updateTransactionsByTag: jest.Mock<
        AITransactionUpdateOrchestrator['updateTransactionsByTag']
    >;
    let command: CategorizeCommand;
    let stdout: jest.Spied<typeof console.log>;
    let stderr: jest.Spied<typeof console.error>;

    const params = { tag: 'test-tag', updateMode: CategorizeMode.Both };
    const printed = () => stdout.mock.calls.map(call => String(call[0])).join('\n');
    const printedErrors = () => stderr.mock.calls.map(call => String(call[0])).join('\n');
    const given = (status: CategorizeStatusDto) =>
        updateTransactionsByTag.mockResolvedValue(status);

    beforeEach(() => {
        updateTransactionsByTag =
            jest.fn<AITransactionUpdateOrchestrator['updateTransactionsByTag']>();
        command = new CategorizeCommand(
            partialMock<AITransactionUpdateOrchestrator>({
                updateTransactionsByTag,
            })
        );
        stdout = jest.spyOn(console, 'log').mockImplementation(() => {});
        stderr = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('prints the header for the mode and processes the tag', async () => {
        given({ status: CategorizeStatus.HAS_RESULTS, transactionsUpdated: 0, errors: [] });

        await command.execute(params);

        expect(updateTransactionsByTag).toHaveBeenCalledWith('test-tag', CategorizeMode.Both);
        expect(printed()).toContain(
            'Processing transactions with tag "test-tag" for categories and budgets'
        );
    });

    it('reports a tag that does not exist', async () => {
        given({ status: CategorizeStatus.NO_TAG, transactionsUpdated: 0, errors: [] });

        await command.execute(params);

        expect(printed()).toContain('Tag "test-tag" not found');
    });

    it('reports a tag with nothing to process', async () => {
        given({ status: CategorizeStatus.EMPTY_TAG, transactionsUpdated: 0, errors: [] });

        await command.execute(params);

        expect(printed()).toContain('No processable transactions found with tag "test-tag"');
    });

    it('reports how many transactions were updated', async () => {
        given({ status: CategorizeStatus.HAS_RESULTS, transactionsUpdated: 5, errors: [] });

        await command.execute(params);

        expect(stdout).toHaveBeenCalledWith('\nUpdated 5 Transaction(s)!');
        expect(stderr).not.toHaveBeenCalled();
    });

    it('marks a dry run', async () => {
        given({ status: CategorizeStatus.HAS_RESULTS, transactionsUpdated: 3, errors: [] });

        await command.execute({ ...params, dryRun: true });

        expect(printed()).toContain('(Dry Run)');
        expect(stdout).toHaveBeenCalledWith('\n[DRYRUN] Updated 3 Transaction(s)!');
    });

    it('lists the transactions that failed, once, on stderr', async () => {
        given({
            status: CategorizeStatus.HAS_RESULTS,
            transactionsUpdated: 8,
            errors: [transactionError('Coffee Bar'), transactionError('Gym')],
        });

        await command.execute(params);

        expect(stdout).toHaveBeenCalledWith('\nUpdated 8 Transaction(s)!');
        expect(stderr).toHaveBeenCalledTimes(1);
        expect(printedErrors()).toContain('2 transaction(s) failed validation');
        expect(printedErrors()).toContain('Coffee Bar');
    });

    describe('when the run fails', () => {
        it('propagates the error without printing it, so the CLI reports it once', async () => {
            const error = new Error('invalid x-api-key');
            updateTransactionsByTag.mockRejectedValue(error);

            await expect(command.execute(params)).rejects.toBe(error);
            expect(printedErrors()).not.toContain('invalid x-api-key');
            expect(printed()).not.toContain('invalid x-api-key');
        });

        it('adds certificate guidance once for a TLS error', async () => {
            const error = Object.assign(new Error('certificate has expired'), {
                code: 'CERT_HAS_EXPIRED',
            });
            updateTransactionsByTag.mockRejectedValue(error);

            await expect(command.execute(params)).rejects.toBe(error);
            expect(stderr).toHaveBeenCalledTimes(1);
            expect(printedErrors()).toContain('This looks like a TLS/certificate error');
            expect(printedErrors()).not.toContain('certificate has expired');
        });
    });
});
