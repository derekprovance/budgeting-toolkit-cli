import { jest } from '@jest/globals';
import { BaseTransactionAnalysisService } from '../../../src/services/core/base-transaction-analysis.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { TransactionAnalysisErrorType } from '../../../src/types/error/transaction-analysis.error.js';

// Mock the services
jest.mock('../../../src/services/core/transaction.service.js');
jest.mock('../../../src/services/core/transaction-classification.service.js');
jest.mock('../../../src/logger.js');

// Create a concrete implementation for testing
class TestAnalysisService extends BaseTransactionAnalysisService<number> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected analyzeTransactions(
        transactions: TransactionSplit[],
        month: number,
        year: number
    ): number {
        return transactions.length;
    }

    protected getOperationName(): string {
        return 'TestAnalysis';
    }
}

describe('BaseTransactionAnalysisService', () => {
    let service: TestAnalysisService;
    let mockTransactionService: any;
    let mockClassificationService: any;
    let mockLogger: any;

    const mockTransaction: Partial<TransactionSplit> = {
        transaction_journal_id: '1',
        description: 'Test',
        amount: '100.00',
        type: 'withdrawal',
        date: '2024-01-15',
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockTransactionService = {
            getTransactionsForMonth: jest.fn(),
        };

        mockClassificationService = {};

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            trace: jest.fn(),
        };

        service = new TestAnalysisService(
            mockTransactionService,
            mockClassificationService,
            mockLogger
        );
    });

    describe('executeAnalysis', () => {
        it('should return error for invalid month (0)', async () => {
            const result = await service.executeAnalysis(0, 2024);

            expect(result.ok).toBe(false);
            expect(result.error?.field).toBe(TransactionAnalysisErrorType.INVALID_DATE);
        });

        it('should return error for invalid month (13)', async () => {
            const result = await service.executeAnalysis(13, 2024);

            expect(result.ok).toBe(false);
            expect(result.error?.field).toBe(TransactionAnalysisErrorType.INVALID_DATE);
        });

        it('should return error for invalid year (below 1900)', async () => {
            const result = await service.executeAnalysis(5, 1899);

            expect(result.ok).toBe(false);
            expect(result.error?.field).toBe(TransactionAnalysisErrorType.INVALID_DATE);
        });

        it('should return error when transaction service throws', async () => {
            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('API error')
            );

            const result = await service.executeAnalysis(5, 2024);

            expect(result.ok).toBe(false);
            expect(result.error?.field).toBe(TransactionAnalysisErrorType.FETCH_FAILED);
        });

        it('should return error when analysis throws', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                mockTransaction,
            ] as any);

            // Override the service to throw during analysis
            const throwingService = new (class extends TestAnalysisService {
                protected analyzeTransactions(): number {
                    throw new Error('Analysis error');
                }
            })(mockTransactionService, mockClassificationService, mockLogger);

            const result = await throwingService.executeAnalysis(5, 2024);

            expect(result.ok).toBe(false);
            expect(result.error?.field).toBe(TransactionAnalysisErrorType.CALCULATION_FAILED);
        });

        it('should return success with empty transactions array', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result = await service.executeAnalysis(5, 2024);

            expect(result.ok).toBe(true);
            expect(result.value).toBe(0);
        });

        it('should return success with transactions', async () => {
            const transactions = [mockTransaction, mockTransaction, mockTransaction];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(transactions as any);

            const result = await service.executeAnalysis(5, 2024);

            expect(result.ok).toBe(true);
            expect(result.value).toBe(3);
        });

        it('should call transaction service with correct parameters', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            await service.executeAnalysis(6, 2024);

            expect(mockTransactionService.getTransactionsForMonth).toHaveBeenCalledWith(6, 2024);
        });

        it('should log debug messages for successful analysis', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([
                mockTransaction,
            ] as any);

            await service.executeAnalysis(5, 2024);

            expect(mockLogger.debug).toHaveBeenCalled();
            const debugCalls = mockLogger.debug.mock.calls;
            expect(debugCalls.some(call => call[1]?.includes('completed successfully'))).toBe(true);
        });

        it('should log error messages when analysis fails', async () => {
            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('Fetch failed')
            );

            await service.executeAnalysis(5, 2024);

            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should log warning for invalid dates', async () => {
            await service.executeAnalysis(0, 2024);

            expect(mockLogger.warn).toHaveBeenCalled();
        });

        it('should handle month at boundaries', async () => {
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);

            const result1 = await service.executeAnalysis(1, 2024);
            expect(result1.ok).toBe(true);

            const result12 = await service.executeAnalysis(12, 2024);
            expect(result12.ok).toBe(true);
        });
    });
});
