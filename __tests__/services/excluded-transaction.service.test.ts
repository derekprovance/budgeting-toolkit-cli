import { ExcludedTransactionService } from '../../src/services/excluded-transaction.service';
import { createReadStream } from 'fs';
import { logger } from '../../src/logger';
import { ExcludedTransactionDto } from '../../src/types/dto/excluded-transaction.dto';

// Mock the logger to prevent console output during tests
jest.mock('../../src/logger', () => ({
    logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    },
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
    access: jest.fn(),
    constants: { F_OK: 0 },
}));

// Mock fs
jest.mock('fs', () => ({
    createReadStream: jest.fn(),
}));

// Mock csv-parse
jest.mock('csv-parse', () => ({
    parse: jest.fn().mockReturnValue({
        [Symbol.asyncIterator]: () => ({
            next: jest.fn(),
        }),
    }),
}));

describe('ExcludedTransactionService', () => {
    let service: ExcludedTransactionService;
    let mockAccess: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ExcludedTransactionService();
        mockAccess = jest.fn();
        jest.requireMock('fs/promises').access = mockAccess;
    });

    describe('getExcludedTransactions', () => {
        it('should return empty array when file does not exist', async () => {
            mockAccess.mockRejectedValueOnce(new Error('File not found'));

            const result = await service.getExcludedTransactions();

            expect(result).toEqual([]);
            expect(logger.debug).toHaveBeenCalledWith(
                'No excluded transactions file found, returning empty array'
            );
        });

        it('should parse valid CSV file and return transactions', async () => {
            const mockRecords = [
                { description: 'VANGUARD BUY INVESTMENT', amount: '4400' },
                { description: 'CRT Management', amount: '1047.66' },
            ];

            mockAccess.mockResolvedValueOnce(undefined);
            (createReadStream as jest.Mock).mockReturnValueOnce({
                pipe: jest.fn().mockReturnThis(),
                [Symbol.asyncIterator]: () => {
                    let index = 0;
                    return {
                        next: async () => {
                            if (index < mockRecords.length) {
                                return {
                                    value: mockRecords[index++],
                                    done: false,
                                };
                            }
                            return { value: undefined, done: true };
                        },
                    };
                },
            });

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
            expect(logger.trace).toHaveBeenCalledWith(
                { records: result },
                'Excluded transactions parsed successfully'
            );
        });

        it('should skip invalid records and log warnings', async () => {
            const mockRecords = [
                { description: '', amount: '4400' }, // Invalid: empty description
                { description: 'VANGUARD BUY INVESTMENT', amount: '4400' }, // Valid
            ];

            mockAccess.mockResolvedValueOnce(undefined);
            (createReadStream as jest.Mock).mockReturnValueOnce({
                pipe: jest.fn().mockReturnThis(),
                [Symbol.asyncIterator]: () => {
                    let index = 0;
                    return {
                        next: async () => {
                            if (index < mockRecords.length) {
                                return {
                                    value: mockRecords[index++],
                                    done: false,
                                };
                            }
                            return { value: undefined, done: true };
                        },
                    };
                },
            });

            const result = await service.getExcludedTransactions();

            expect(result).toEqual([
                {
                    description: 'VANGUARD BUY INVESTMENT',
                    amount: '4400.00',
                    reason: 'Excluded from processing',
                },
            ]);
            expect(logger.warn).toHaveBeenCalledWith(
                `Invalid excluded transaction record: ${JSON.stringify(mockRecords[0])}`
            );
        });

        it('should handle CSV parsing errors', async () => {
            mockAccess.mockResolvedValueOnce(undefined);
            (createReadStream as jest.Mock).mockReturnValueOnce({
                pipe: jest.fn().mockReturnThis(),
                [Symbol.asyncIterator]: () => {
                    return {
                        next: async () => {
                            throw new Error('CSV parsing error');
                        },
                    };
                },
            });

            await expect(service.getExcludedTransactions()).rejects.toThrow(
                'Failed to parse excluded transactions file'
            );
            expect(logger.error).toHaveBeenCalled();
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
