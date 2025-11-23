import { jest } from '@jest/globals';
import { ILogger } from '../../src/types/interface/logger.interface.js';
import { ExcludedTransaction } from '../../src/config/config.types.js';
import { ExcludedTransactionService } from '../../src/services/excluded-transaction.service.js';

describe('ExcludedTransactionService', () => {
    let service: ExcludedTransactionService;
    let mockLogger: ILogger;

    const mockExcludedTransactions: ExcludedTransaction[] = [
        {
            description: 'VANGUARD BUY INVESTMENT',
            amount: '4400.00',
            reason: 'Investment purchase',
        },
        {
            description: 'CRT Management',
            amount: '1047.66',
            reason: 'Management fee',
        },
        {
            description: 'Excluded Description Only',
        },
        {
            amount: '999.99',
            reason: 'Excluded by amount only',
        },
    ];

    beforeEach(() => {
        // Create mock logger
        mockLogger = {
            debug: jest.fn<(obj: unknown, msg: string) => void>(),
            info: jest.fn<(obj: unknown, msg: string) => void>(),
            warn: jest.fn<(obj: unknown, msg: string) => void>(),
            error: jest.fn<(obj: unknown, msg: string) => void>(),
            trace: jest.fn<(obj: unknown, msg: string) => void>(),
        };

        service = new ExcludedTransactionService(mockExcludedTransactions, mockLogger);
    });

    describe('getExcludedTransactions', () => {
        it('should return all excluded transactions from config', async () => {
            const result = await service.getExcludedTransactions();

            expect(result).toEqual([
                {
                    description: 'VANGUARD BUY INVESTMENT',
                    amount: '4400.00',
                    reason: 'Investment purchase',
                },
                {
                    description: 'CRT Management',
                    amount: '1047.66',
                    reason: 'Management fee',
                },
                {
                    description: 'Excluded Description Only',
                    amount: undefined,
                    reason: 'Excluded from processing',
                },
                {
                    description: undefined,
                    amount: '999.99',
                    reason: 'Excluded by amount only',
                },
            ]);

            expect(mockLogger.trace).toHaveBeenCalledWith(
                { count: 4 },
                'Returning excluded transactions from configuration'
            );
        });

        it('should return empty array when no excluded transactions configured', async () => {
            const emptyService = new ExcludedTransactionService([], mockLogger);
            const result = await emptyService.getExcludedTransactions();

            expect(result).toEqual([]);
            expect(mockLogger.trace).toHaveBeenCalledWith(
                { count: 0 },
                'Returning excluded transactions from configuration'
            );
        });

        it('should use default reason when not provided', async () => {
            const transactionWithoutReason: ExcludedTransaction[] = [
                {
                    description: 'Test',
                    amount: '100.00',
                },
            ];

            const testService = new ExcludedTransactionService(
                transactionWithoutReason,
                mockLogger
            );
            const result = await testService.getExcludedTransactions();

            expect(result[0].reason).toBe('Excluded from processing');
        });
    });

    describe('isExcludedTransaction', () => {
        it('should return true when both description and amount match', async () => {
            const result = await service.isExcludedTransaction(
                'VANGUARD BUY INVESTMENT',
                '4400.00'
            );
            expect(result).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                { description: 'VANGUARD BUY INVESTMENT', amount: '4400.00' },
                'Transaction matched exclusion criteria'
            );
        });

        it('should return true when only description matches (no amount in config)', async () => {
            const result = await service.isExcludedTransaction(
                'Excluded Description Only',
                '500.00'
            );
            expect(result).toBe(true);
        });

        it('should return true when only amount matches (no description in config)', async () => {
            const result = await service.isExcludedTransaction('Any Description', '999.99');
            expect(result).toBe(true);
        });

        it('should return false when description matches but amount does not', async () => {
            const result = await service.isExcludedTransaction(
                'VANGUARD BUY INVESTMENT',
                '1000.00'
            );
            expect(result).toBe(false);
        });

        it('should return false for non-matching description', async () => {
            const result = await service.isExcludedTransaction('NON-MATCHING', '4400.00');
            expect(result).toBe(false);
        });

        it('should return false for non-matching amount', async () => {
            const result = await service.isExcludedTransaction('CRT Management', '2000.00');
            expect(result).toBe(false);
        });

        it('should handle amount conversion with currency symbols', async () => {
            const result = await service.isExcludedTransaction(
                'VANGUARD BUY INVESTMENT',
                '$4,400.00'
            );
            expect(result).toBe(true);
        });

        it('should handle negative amounts with parentheses', async () => {
            const result = await service.isExcludedTransaction(
                'VANGUARD BUY INVESTMENT',
                '($4,400.00)'
            );
            expect(result).toBe(true);
        });

        it('should handle negative amounts with minus sign', async () => {
            const result = await service.isExcludedTransaction(
                'VANGUARD BUY INVESTMENT',
                '-4400.00'
            );
            expect(result).toBe(true);
        });

        it('should compare absolute values for amounts', async () => {
            const result = await service.isExcludedTransaction('CRT Management', '-1047.66');
            expect(result).toBe(true);
        });
    });

    describe('convertCurrencyToFloat', () => {
        let convertCurrencyToFloat: (amount: string) => string;

        beforeEach(() => {
            // Access the private method through the prototype and bind it to the service instance
            convertCurrencyToFloat = (
                service as unknown as {
                    convertCurrencyToFloat: (amount: string) => string;
                }
            ).convertCurrencyToFloat.bind(service);
        });

        it('should convert currency string to float', () => {
            const result = convertCurrencyToFloat('$4,400.00');
            expect(result).toBe('4400.00');
        });

        it('should handle negative amounts with parentheses', () => {
            const result = convertCurrencyToFloat('($4,400.00)');
            expect(result).toBe('-4400.00');
        });

        it('should handle negative amounts with minus sign', () => {
            const result = convertCurrencyToFloat('-$4,400.00');
            expect(result).toBe('-4400.00');
        });

        it('should handle different currency symbols', () => {
            expect(convertCurrencyToFloat('€4,400.00')).toBe('4400.00');
            expect(convertCurrencyToFloat('£4,400.00')).toBe('4400.00');
            expect(convertCurrencyToFloat('¥4,400.00')).toBe('4400.00');
        });

        it('should handle amounts without currency symbols', () => {
            const result = convertCurrencyToFloat('4400.00');
            expect(result).toBe('4400.00');
        });

        it('should handle amounts with commas', () => {
            const result = convertCurrencyToFloat('1,234,567.89');
            expect(result).toBe('1234567.89');
        });

        it('should round to 2 decimal places', () => {
            const result = convertCurrencyToFloat('100.126');
            expect(result).toBe('100.13');
        });

        it('should throw error for invalid amount format', () => {
            expect(() => convertCurrencyToFloat('invalid')).toThrow('Invalid amount format');
        });

        it('should throw error for empty amount', () => {
            expect(() => convertCurrencyToFloat('')).toThrow('Amount cannot be empty');
        });

        it('should throw error for amount with letters', () => {
            expect(() => convertCurrencyToFloat('$123abc')).toThrow('Invalid amount format');
        });
    });
});
