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

    describe('isExcludedTransaction', () => {
        it('should return true when both description and amount match', () => {
            const result = service.isExcludedTransaction('VANGUARD BUY INVESTMENT', '4400.00');
            expect(result).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                { description: 'VANGUARD BUY INVESTMENT', amount: '4400.00' },
                'Transaction matched exclusion criteria'
            );
        });

        it('should return true when only description matches (no amount in config)', () => {
            const result = service.isExcludedTransaction('Excluded Description Only', '500.00');
            expect(result).toBe(true);
        });

        it('should return true when only amount matches (no description in config)', () => {
            const result = service.isExcludedTransaction('Any Description', '999.99');
            expect(result).toBe(true);
        });

        it('should return false when description matches but amount does not', () => {
            const result = service.isExcludedTransaction('VANGUARD BUY INVESTMENT', '1000.00');
            expect(result).toBe(false);
        });

        it('should return false for non-matching description', () => {
            const result = service.isExcludedTransaction('NON-MATCHING', '4400.00');
            expect(result).toBe(false);
        });

        it('should return false for non-matching amount', () => {
            const result = service.isExcludedTransaction('CRT Management', '2000.00');
            expect(result).toBe(false);
        });

        it('should handle amount conversion with currency symbols', () => {
            const result = service.isExcludedTransaction('VANGUARD BUY INVESTMENT', '$4,400.00');
            expect(result).toBe(true);
        });

        it('should handle negative amounts with parentheses', () => {
            const result = service.isExcludedTransaction('VANGUARD BUY INVESTMENT', '($4,400.00)');
            expect(result).toBe(true);
        });

        it('should handle negative amounts with minus sign', () => {
            const result = service.isExcludedTransaction('VANGUARD BUY INVESTMENT', '-4400.00');
            expect(result).toBe(true);
        });

        it('should compare absolute values for amounts', () => {
            const result = service.isExcludedTransaction('CRT Management', '-1047.66');
            expect(result).toBe(true);
        });
    });

    describe('malformed amounts', () => {
        it('should not throw on empty amounts and treat them as non-matching', () => {
            expect(() => service.isExcludedTransaction('Any Description', '')).not.toThrow();
            expect(service.isExcludedTransaction('Any Description', '')).toBe(false);
        });

        it('should not throw on unparseable amounts and treat them as non-matching', () => {
            expect(() => service.isExcludedTransaction('Any Description', 'abc')).not.toThrow();
            expect(service.isExcludedTransaction('Any Description', 'abc')).toBe(false);
        });

        it('should still match description-only rules when the amount is malformed', () => {
            expect(service.isExcludedTransaction('Excluded Description Only', 'garbage')).toBe(
                true
            );
        });
    });
});
