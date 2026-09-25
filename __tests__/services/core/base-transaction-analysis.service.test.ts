import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BaseTransactionAnalysisService } from '../../../src/services/core/base-transaction-analysis.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import {
    TransactionAnalysisError,
    TransactionAnalysisErrorType,
} from '../../../src/types/error/transaction-analysis.error.js';
import { ITransactionService } from '../../../src/services/core/transaction.service.interface.js';
import { ITransactionClassificationService } from '../../../src/services/core/transaction-classification.service.interface.js';
import { ILogger } from '../../../src/types/interface/logger.interface.js';
import { Result } from '../../../src/types/result.type.js';
import { withdrawal } from '../../shared/test-data.js';

// Create a concrete implementation for testing. `run` exposes the protected
// template method so the tests can drive it directly.
class TestAnalysisService extends BaseTransactionAnalysisService<number> {
    run(month: number, year: number): Promise<Result<number, TransactionAnalysisError>> {
        return this.executeAnalysis(month, year);
    }

    protected analyzeTransactions(transactions: TransactionSplit[]): number {
        return transactions.length;
    }

    protected getOperationName(): string {
        return 'TestAnalysis';
    }
}

const errorOf = (result: Result<number, TransactionAnalysisError>) =>
    result.ok ? undefined : result.error;
const valueOf = (result: Result<number, TransactionAnalysisError>) =>
    result.ok ? result.value : undefined;

type LogFn = (obj: unknown, msg?: string) => void;

describe('BaseTransactionAnalysisService', () => {
    let service: TestAnalysisService;
    let mockTransactionService: {
        getTransactionsForMonth: jest.Mock<ITransactionService['getTransactionsForMonth']>;
    };
    let mockClassificationService: ITransactionClassificationService;
    let mockLogger: { [K in 'debug' | 'info' | 'warn' | 'error' | 'trace']: jest.Mock<LogFn> };

    const mockTransaction = withdrawal('100.00', {
        transaction_journal_id: '1',
        description: 'Test',
        date: '2024-01-15',
    });

    beforeEach(() => {
        jest.clearAllMocks();

        mockTransactionService = {
            getTransactionsForMonth: jest.fn<ITransactionService['getTransactionsForMonth']>(),
        };

        mockClassificationService = {} as ITransactionClassificationService;

        mockLogger = {
            debug: jest.fn<LogFn>(),
            info: jest.fn<LogFn>(),
            warn: jest.fn<LogFn>(),
            error: jest.fn<LogFn>(),
            trace: jest.fn<LogFn>(),
        };

        service = new TestAnalysisService(
            mockTransactionService as unknown as ITransactionService,
            mockClassificationService,
            mockLogger as ILogger
        );
    });

    describe('executeAnalysis', () => {
        it('should return error for invalid month (0)', async () => {
            const result = await service.run(0, 2024);

            expect(result.ok).toBe(false);
            expect(errorOf(result)?.field).toBe(TransactionAnalysisErrorType.INVALID_DATE);
        });

        it('should return error for invalid month (13)', async () => {
            const result = await service.run(13, 2024);

            expect(result.ok).toBe(false);
            expect(errorOf(result)?.field).toBe(TransactionAnalysisErrorType.INVALID_DATE);
        });

        it('should return error for invalid year (below 1900)', async () => {
            const result = await service.run(5, 1899);

            expect(result.ok).toBe(false);
            expect(errorOf(result)?.field).toBe(TransactionAnalysisErrorType.INVALID_DATE);
        });

        it('should return error when transaction service throws', async () => {
            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('API error')
            );

            const result = await service.run(5, 2024);

            expect(result.ok).toBe(false);
            expect(errorOf(result)?.field).toBe(TransactionAnalysisErrorType.FETCH_FAILED);
        });

        it('should return error when analysis throws', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([mockTransaction]);

            // Override the service to throw during analysis
            const throwingService = new (class extends TestAnalysisService {
                protected analyzeTransactions(): number {
                    throw new Error('Analysis error');
                }
            })(
                mockTransactionService as unknown as ITransactionService,
                mockClassificationService,
                mockLogger as ILogger
            );

            const result = await throwingService.run(5, 2024);

            expect(result.ok).toBe(false);
            expect(errorOf(result)?.field).toBe(TransactionAnalysisErrorType.CALCULATION_FAILED);
        });

        it('should return success with empty transactions array', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await service.run(5, 2024);

            expect(result.ok).toBe(true);
            expect(valueOf(result)).toBe(0);
        });

        it('should return success with transactions', async () => {
            const transactions = [mockTransaction, mockTransaction, mockTransaction];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions);

            const result = await service.run(5, 2024);

            expect(result.ok).toBe(true);
            expect(valueOf(result)).toBe(3);
        });

        it('should call transaction service with correct parameters', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            await service.run(6, 2024);

            expect(mockTransactionService.getTransactionsForMonth).toHaveBeenCalledWith(6, 2024);
        });

        it('should log debug messages for successful analysis', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([mockTransaction]);

            await service.run(5, 2024);

            expect(mockLogger.debug).toHaveBeenCalled();
            const debugCalls = mockLogger.debug.mock.calls;
            expect(debugCalls.some(call => call[1]?.includes('completed successfully'))).toBe(true);
        });

        it('should log error messages when analysis fails', async () => {
            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('Fetch failed')
            );

            await service.run(5, 2024);

            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should log warning for invalid dates', async () => {
            await service.run(0, 2024);

            expect(mockLogger.warn).toHaveBeenCalled();
        });

        it('should handle month at boundaries', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result1 = await service.run(1, 2024);
            expect(result1.ok).toBe(true);

            const result12 = await service.run(12, 2024);
            expect(result12.ok).toBe(true);
        });
    });
});
