import { jest } from '@jest/globals';
import { ILogger } from '../../src/types/interface/logger.interface.js';
import { ExcludedTransaction } from '../../src/config/config.types.js';
import { ExcludedTransactionService } from '../../src/services/excluded-transaction.service.js';

describe('ExcludedTransactionService', () => {
    let service: ExcludedTransactionService;
    let mockLogger: ILogger;

    const mockExcludedTransactions: ExcludedTransaction[] = [
        {
            description: 'BROKERAGE BUY INVESTMENT',
            amount: '2000.00',
            reason: 'Investment purchase',
        },
        {
            description: 'PROPERTY MGMT CO',
            amount: '850.00',
            reason: 'Management fee',
        },
        {
            description: 'Excluded Description Only',
        },
        {
            description: 'Monthly Rent',
            amount: '$1,200.00',
            reason: 'Rule amount written with currency formatting',
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
            const result = service.isExcludedTransaction('BROKERAGE BUY INVESTMENT', '2000.00');
            expect(result).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                { description: 'BROKERAGE BUY INVESTMENT', amount: '2000.00' },
                'Transaction matched exclusion criteria'
            );
        });

        it('should return true when only description matches (no amount in config)', () => {
            const result = service.isExcludedTransaction('Excluded Description Only', '500.00');
            expect(result).toBe(true);
        });

        it('should parse a currency-formatted rule amount the same way as the transaction', () => {
            // The rule reads '$1,200.00'; bare parseFloat would make it NaN (or,
            // without the '$', the number 1) and silently match the wrong thing
            expect(service.isExcludedTransaction('Monthly Rent', '1200.00')).toBe(true);
            expect(service.isExcludedTransaction('Monthly Rent', '1.00')).toBe(false);
        });

        it('should return false when description matches but amount does not', () => {
            const result = service.isExcludedTransaction('BROKERAGE BUY INVESTMENT', '1000.00');
            expect(result).toBe(false);
        });

        it('should return false for non-matching description', () => {
            const result = service.isExcludedTransaction('NON-MATCHING', '2000.00');
            expect(result).toBe(false);
        });

        it('should return false for non-matching amount', () => {
            const result = service.isExcludedTransaction('PROPERTY MGMT CO', '2000.00');
            expect(result).toBe(false);
        });

        it('should handle amount conversion with currency symbols', () => {
            const result = service.isExcludedTransaction('BROKERAGE BUY INVESTMENT', '$2,000.00');
            expect(result).toBe(true);
        });

        it('should handle negative amounts with parentheses', () => {
            const result = service.isExcludedTransaction('BROKERAGE BUY INVESTMENT', '($2,000.00)');
            expect(result).toBe(true);
        });

        it('should handle negative amounts with minus sign', () => {
            const result = service.isExcludedTransaction('BROKERAGE BUY INVESTMENT', '-2000.00');
            expect(result).toBe(true);
        });

        it('should compare absolute values for amounts', () => {
            const result = service.isExcludedTransaction('PROPERTY MGMT CO', '-850.00');
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

        it('should not match when the RULE amount is unparseable', () => {
            const badRule = new ExcludedTransactionService(
                [{ description: 'Broken Rule', amount: 'not-an-amount' }],
                mockLogger
            );

            expect(badRule.isExcludedTransaction('Broken Rule', '100.00')).toBe(false);
        });
    });

    describe('rules without a description', () => {
        // ConfigValidator rejects these at startup, but the service must never
        // fall back to matching on amount alone: exclusion happens at fetch time,
        // so an amount-only rule would drop every transaction of that amount on
        // every account, in either direction.
        it('should ignore a rule carrying only an amount', () => {
            const amountOnly = new ExcludedTransactionService(
                [{ amount: '999.99' } as unknown as ExcludedTransaction],
                mockLogger
            );

            expect(amountOnly.isExcludedTransaction('Any Description', '999.99')).toBe(false);
            expect(amountOnly.isExcludedTransaction('Any Description', '-999.99')).toBe(false);
        });

        it('should ignore a rule with an empty description', () => {
            const emptyDescription = new ExcludedTransactionService(
                [{ description: '', amount: '999.99' }],
                mockLogger
            );

            expect(emptyDescription.isExcludedTransaction('', '999.99')).toBe(false);
        });
    });
});
