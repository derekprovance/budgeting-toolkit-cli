import { jest } from '@jest/globals';
import { ILogger } from '../../src/types/interface/logger.interface.js';

// Mock fs/promises with actual jest mock functions
const mockReadFile = jest.fn();
const mockAccess = jest.fn();

jest.unstable_mockModule('fs/promises', () => ({
    readFile: mockReadFile,
    access: mockAccess,
}));

// Dynamic imports after mocks
const { ExcludedTransactionService } = await import(
    '../../src/services/excluded-transaction.service.js'
);

describe('ExcludedTransactionService', () => {
    let service: ExcludedTransactionService;
    let mockLogger: ILogger;

    beforeEach(() => {
        // Reset mocks
        mockReadFile.mockReset();
        mockAccess.mockReset();

        // Create mock logger
        mockLogger = {
            debug: jest.fn<(obj: unknown, msg: string) => void>(),
            info: jest.fn<(obj: unknown, msg: string) => void>(),
            warn: jest.fn<(obj: unknown, msg: string) => void>(),
            error: jest.fn<(obj: unknown, msg: string) => void>(),
            trace: jest.fn<(obj: unknown, msg: string) => void>(),
        };

        service = new ExcludedTransactionService(
            '/test/path/excluded_transactions.csv',
            mockLogger
        );
    });

    describe('getExcludedTransactions', () => {
        it('should return empty array when file does not exist', async () => {
            (mockAccess as jest.Mock).mockRejectedValueOnce(new Error('File not found'));

            const result = await service.getExcludedTransactions();

            expect(result).toEqual([]);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'No excluded transactions file found, returning empty array'
            );
        });

        it('should parse valid CSV file and return transactions', async () => {
            const csvContent = `VANGUARD BUY INVESTMENT,4400
CRT Management,1047.66`;

            (mockAccess as jest.Mock).mockResolvedValueOnce(undefined);
            (mockReadFile as jest.Mock).mockResolvedValueOnce(csvContent);

            const result = await service.getExcludedTransactions();

            expect(result).toEqual([
                {
                    description: 'VANGUARD BUY INVESTMENT',
                    amount: '4400.00',
                    reason: 'Excluded from processing',
                },
                {
                    description: 'CRT Management',
                    amount: '1047.66',
                    reason: 'Excluded from processing',
                },
            ]);
            expect(mockLogger.trace).toHaveBeenCalledWith(
                { records: result },
                'Excluded transactions parsed successfully'
            );
        });

        it('should skip invalid records and log warnings', async () => {
            const csvContent = `,4400
VANGUARD BUY INVESTMENT,4400`;

            (mockAccess as jest.Mock).mockResolvedValueOnce(undefined);
            (mockReadFile as jest.Mock).mockResolvedValueOnce(csvContent);

            const result = await service.getExcludedTransactions();

            expect(result).toEqual([
                {
                    description: 'VANGUARD BUY INVESTMENT',
                    amount: '4400.00',
                    reason: 'Excluded from processing',
                },
            ]);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                `Invalid excluded transaction record: ${JSON.stringify({ description: '', amount: '4400' })}`
            );
        });

        it('should handle CSV parsing errors', async () => {
            (mockAccess as jest.Mock).mockResolvedValueOnce(undefined);
            (mockReadFile as jest.Mock).mockRejectedValueOnce(new Error('File read error'));

            await expect(service.getExcludedTransactions()).rejects.toThrow(
                'Failed to parse excluded transactions file'
            );
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('isExcludedTransaction', () => {
        const mockTransactions: ExcludedTransactionDto[] = [
            {
                description: 'VANGUARD BUY INVESTMENT',
                amount: '4400.00',
                reason: 'Excluded from processing',
            },
            {
                description: 'CRT Management',
                amount: '1047.66',
                reason: 'Excluded from processing',
            },
        ];

        beforeEach(() => {
            // Mock getExcludedTransactions to return test data
            jest.spyOn(service, 'getExcludedTransactions').mockResolvedValue(mockTransactions);
        });

        it('should return true for matching description and amount', async () => {
            const result = await service.isExcludedTransaction(
                'VANGUARD BUY INVESTMENT',
                '4400.00'
            );
            expect(result).toBe(true);
        });

        it('should return false for non-matching description', async () => {
            const result = await service.isExcludedTransaction('NON-MATCHING', '4400.00');
            expect(result).toBe(false);
        });

        it('should return false for non-matching amount', async () => {
            const result = await service.isExcludedTransaction(
                'VANGUARD BUY INVESTMENT',
                '1000.00'
            );
            expect(result).toBe(false);
        });

        it('should handle amount conversion with currency symbols', async () => {
            const result = await service.isExcludedTransaction(
                'VANGUARD BUY INVESTMENT',
                '$4,400.00'
            );
            expect(result).toBe(true);
        });

        it('should handle negative amounts', async () => {
            const result = await service.isExcludedTransaction(
                'VANGUARD BUY INVESTMENT',
                '-4400.00'
            );
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

        it('should handle negative amounts', () => {
            const result = convertCurrencyToFloat('($4,400.00)');
            expect(result).toBe('-4400.00');
        });

        it('should handle different currency symbols', () => {
            const result = convertCurrencyToFloat('€4,400.00');
            expect(result).toBe('4400.00');
        });

        it('should throw error for invalid amount format', () => {
            expect(() => convertCurrencyToFloat('invalid')).toThrow('Invalid amount format');
        });

        it('should throw error for empty amount', () => {
            expect(() => convertCurrencyToFloat('')).toThrow('Amount cannot be empty');
        });
    });
});
