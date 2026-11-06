import { jest } from '@jest/globals';
import { SplitTransactionCommand } from '../../src/commands/split-transaction.command.js';
import { TransactionSplitService } from '../../src/services/transaction-split.service.js';
import { SplitTransactionDisplayService } from '../../src/services/display/split-transaction-display.service.js';
import { UserInputService } from '../../src/services/user-input.service.js';
import { TransactionRead } from '@derekprovance/firefly-iii-sdk';
import { withdrawal } from '../shared/test-data.js';

// Collaborators are injected as manual mocks; chalk and ora are real
// (FORCE_COLOR=0 in __tests__/setup/env.ts keeps output plain).

describe('SplitTransactionCommand', () => {
    let command: SplitTransactionCommand;
    let splitService: jest.Mocked<TransactionSplitService>;
    let displayService: jest.Mocked<SplitTransactionDisplayService>;
    let userInputService: jest.Mocked<UserInputService>;
    let consoleLogSpy: jest.Spied<typeof console.log>;

    const originalSplit = withdrawal('100.00', {
        description: 'Test Transaction',
        currency_symbol: '$',
    });

    const updatedTransaction: TransactionRead = {
        type: 'transactions',
        id: '123',
        links: {},
        attributes: { transactions: [originalSplit, originalSplit] },
    };

    const nonInteractive = {
        transactionId: '123',
        amount: '60.00',
        descriptions: ['- Part 1', '- Part 2'],
        yes: true,
    };

    beforeEach(() => {
        jest.clearAllMocks();

        splitService = {
            getSingleSplit: jest.fn<TransactionSplitService['getSingleSplit']>(),
            splitTransaction: jest
                .fn<TransactionSplitService['splitTransaction']>()
                .mockResolvedValue(updatedTransaction),
        } as unknown as jest.Mocked<TransactionSplitService>;
        splitService.getSingleSplit.mockResolvedValue(originalSplit);

        displayService = {
            formatHeader: jest.fn().mockReturnValue('Mock Header'),
            formatOriginalTransaction: jest.fn().mockReturnValue('Mock Original'),
            formatRemainder: jest.fn().mockReturnValue('Mock Remainder'),
            formatSplitPreview: jest.fn().mockReturnValue('Mock Preview'),
            formatSuccess: jest.fn().mockReturnValue('Mock Success'),
        } as unknown as jest.Mocked<SplitTransactionDisplayService>;

        userInputService = {
            getSplitAmount: jest.fn(),
            getCustomSplitText: jest.fn(),
            confirmSplit: jest.fn(),
        } as unknown as jest.Mocked<UserInputService>;

        command = new SplitTransactionCommand(splitService, displayService, userInputService);

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    describe('execute', () => {
        it('should split transaction successfully in non-interactive mode with all parameters', async () => {
            await command.execute(nonInteractive);

            expect(splitService.getSingleSplit).toHaveBeenCalledWith('123');
            expect(userInputService.getSplitAmount).not.toHaveBeenCalled();
            expect(userInputService.getCustomSplitText).not.toHaveBeenCalled();
            expect(userInputService.confirmSplit).not.toHaveBeenCalled();
            expect(splitService.splitTransaction).toHaveBeenCalledWith('123', originalSplit, [
                { amount: '60.00', description: 'Test Transaction - Part 1' },
                { amount: '40.00', description: 'Test Transaction - Part 2' },
            ]);
            expect(displayService.formatSuccess).toHaveBeenCalledWith('123', 2);
        });

        it('should reject with the service error when the transaction cannot be fetched', async () => {
            splitService.getSingleSplit.mockRejectedValue(
                new Error('Failed to fetch transaction 123: Unauthenticated')
            );

            await expect(command.execute(nonInteractive)).rejects.toThrow(
                'Failed to fetch transaction 123: Unauthenticated'
            );

            expect(userInputService.getSplitAmount).not.toHaveBeenCalled();
            expect(splitService.splitTransaction).not.toHaveBeenCalled();
        });

        it('should reject an --amount the split cannot take', async () => {
            await expect(command.execute({ ...nonInteractive, amount: '150.00' })).rejects.toThrow(
                'Amount must be less than the original amount ($100)'
            );

            expect(splitService.splitTransaction).not.toHaveBeenCalled();
        });

        it('should reject, without printing the error itself, when the split fails', async () => {
            splitService.splitTransaction.mockRejectedValue(
                new Error('Failed to split transaction 123: API error')
            );

            await expect(command.execute(nonInteractive)).rejects.toThrow(
                'Failed to split transaction 123: API error'
            );

            // The CLI's handleError prints it once and exits 1
            const printed = consoleLogSpy.mock.calls.map(call => String(call[0])).join('\n');
            expect(printed).not.toContain('API error');
            expect(displayService.formatSuccess).not.toHaveBeenCalled();
        });

        it('should cancel split when user does not confirm', async () => {
            userInputService.confirmSplit.mockResolvedValue(false);

            await command.execute({ ...nonInteractive, yes: false });

            expect(splitService.splitTransaction).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Split cancelled'));
        });

        it('should prompt for split amount when not provided via CLI', async () => {
            userInputService.getSplitAmount.mockResolvedValue(60);
            userInputService.confirmSplit.mockResolvedValue(true);

            await command.execute({ ...nonInteractive, amount: undefined, yes: false });

            expect(userInputService.getSplitAmount).toHaveBeenCalledWith(100, '$');
            expect(splitService.splitTransaction).toHaveBeenCalled();
        });

        it('should prompt for custom text when descriptions not provided via CLI', async () => {
            userInputService.getCustomSplitText.mockResolvedValue('- custom text');
            userInputService.confirmSplit.mockResolvedValue(true);

            await command.execute({ ...nonInteractive, descriptions: undefined, yes: false });

            expect(userInputService.getCustomSplitText).toHaveBeenCalledTimes(2);
            expect(userInputService.getCustomSplitText).toHaveBeenNthCalledWith(1, 1);
            expect(userInputService.getCustomSplitText).toHaveBeenNthCalledWith(2, 2);
            expect(splitService.splitTransaction).toHaveBeenCalledWith('123', originalSplit, [
                { amount: '60.00', description: 'Test Transaction - custom text' },
                { amount: '40.00', description: 'Test Transaction - custom text' },
            ]);
        });

        it('should keep the original description for a split given empty custom text', async () => {
            await command.execute({ ...nonInteractive, descriptions: ['- Part 1', ''] });

            expect(splitService.splitTransaction).toHaveBeenCalledWith('123', originalSplit, [
                { amount: '60.00', description: 'Test Transaction - Part 1' },
                { amount: '40.00', description: 'Test Transaction' },
            ]);
        });

        it('should use yes flag to skip confirmation prompt', async () => {
            await command.execute(nonInteractive);

            expect(userInputService.confirmSplit).not.toHaveBeenCalled();
            expect(splitService.splitTransaction).toHaveBeenCalled();
        });

        it('should handle transaction without currency symbol (use default)', async () => {
            splitService.getSingleSplit.mockResolvedValue(
                withdrawal('100.00', { currency_symbol: undefined })
            );
            userInputService.getSplitAmount.mockResolvedValue(60);
            userInputService.getCustomSplitText.mockResolvedValue('');
            userInputService.confirmSplit.mockResolvedValue(true);

            await command.execute({ transactionId: '123' });

            expect(userInputService.getSplitAmount).toHaveBeenCalledWith(100, '$');
        });

        it('should calculate remainder amount correctly with floating point precision', async () => {
            const odd = withdrawal('100.33', { description: 'Odd', currency_symbol: '$' });
            splitService.getSingleSplit.mockResolvedValue(odd);

            await command.execute({ ...nonInteractive, amount: '60.15' });

            expect(displayService.formatRemainder).toHaveBeenCalledWith(40.18, '$');
            expect(splitService.splitTransaction).toHaveBeenCalledWith('123', odd, [
                expect.objectContaining({ amount: '60.15' }),
                expect.objectContaining({ amount: '40.18' }),
            ]);
        });
    });
});
