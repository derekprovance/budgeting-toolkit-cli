import { jest } from '@jest/globals';
import { BudgetLimitRead } from '@derekprovance/firefly-iii-sdk';
import { AnalyzeCommand } from '../../src/commands/analyze.command.js';
import { BillComparisonService } from '../../src/services/bill-comparison.service.js';
import { IBudgetService } from '../../src/services/core/budget.service.interface.js';
import { AnalyzeDisplayService } from '../../src/services/display/analyze-display.service.js';
import { BillComparisonDto } from '../../src/types/dto/bill-comparison.dto.js';
import { Result } from '../../src/types/result.type.js';
import { CashFlowService } from '../../src/services/cash-flow.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import {
    buckets,
    createMockAccountScopeService,
    createMockCashFlowService,
    createMockExcludedTransactionService,
    createMockFireflyClient,
    createMockLogger,
    partialMock,
} from '../shared/mocks.js';
import { deposit, withdrawal } from '../shared/test-data.js';

const limit = (amount: string) => ({ attributes: { amount } }) as unknown as BudgetLimitRead;

describe('AnalyzeCommand', () => {
    let billComparisonService: jest.Mocked<BillComparisonService>;
    let budgetService: jest.Mocked<IBudgetService>;
    let analyzeDisplayService: jest.Mocked<AnalyzeDisplayService>;
    let consoleLogSpy: jest.Spied<typeof console.log>;
    let consoleErrorSpy: jest.Spied<typeof console.error>;

    const monthBuckets = buckets({
        paycheck: [deposit(5500)],
        additionalIncome: [deposit(100)],
        budget: [withdrawal(1794.94)],
        unbudgeted: [withdrawal(100)],
        disposable: [withdrawal(150)],
    });

    const build = (cashFlow: CashFlowService = createMockCashFlowService(monthBuckets)) =>
        new AnalyzeCommand(
            cashFlow,
            billComparisonService,
            budgetService,
            analyzeDisplayService,
            5000
        );

    beforeEach(() => {
        billComparisonService = partialMock<BillComparisonService>({
            calculateBillComparison: jest
                .fn<BillComparisonService['calculateBillComparison']>()
                .mockResolvedValue(Result.ok(BillComparisonDto.create(1200, 1250, [], 'USD', '$'))),
        });

        budgetService = partialMock<IBudgetService>({
            getBudgetLimits: jest
                .fn<IBudgetService['getBudgetLimits']>()
                .mockResolvedValue([limit('1000'), limit('840'), limit('not a number')]),
        });

        analyzeDisplayService = partialMock<AnalyzeDisplayService>({
            formatAnalysisReport: jest
                .fn<AnalyzeDisplayService['formatAnalysisReport']>()
                .mockReturnValue('Mock Analysis Report'),
        });

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('[R-PURPOSE-1] should compute the net from the buckets and the bills', async () => {
        const result = await build().execute({ month: 5, year: 2024 });

        expect(analyzeDisplayService.formatAnalysisReport).toHaveBeenCalledWith(result, false);
        // 5500 + 100 - 1250 - 1794.94 - 100; disposable is not in the net
        expect(result.netImpact).toBeCloseTo(2455.06, 2);
    });

    it('should total the month allocations, skipping an unparseable one', async () => {
        const result = await build().execute({ month: 5, year: 2024 });

        expect(result.budgetAllocated).toBe(1840);
        expect(result.budgetSurplus).toBeCloseTo(45.06, 2);
    });

    it('should report the paycheck against the configured expectation', async () => {
        const result = await build().execute({ month: 5, year: 2024 });

        expect(result.expectedMonthlyPaycheck).toBe(5000);
        expect(result.paycheckSurplus).toBe(500);
    });

    it('should fail with the user-facing message when bucketing fails', async () => {
        const cashFlow = createMockCashFlowService();
        cashFlow.getBuckets.mockResolvedValueOnce({
            ok: false,
            error: { message: 'fetch failed', userMessage: 'Could not reach Firefly' },
        } as never);

        await expect(build(cashFlow).execute({ month: 5, year: 2024 })).rejects.toThrow(
            'fetch failed'
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('Could not reach Firefly')
        );
    });

    it("should fail with Firefly's reason and the month and year when the fetch is refused", async () => {
        const client = createMockFireflyClient();
        const fireflyError = new Error('Request failed with status code 401');
        client.transactions.listTransaction.mockRejectedValue(fireflyError);
        const cashFlow = new CashFlowService(
            new TransactionService(
                createMockExcludedTransactionService(),
                client,
                new Map(),
                createMockLogger()
            ),
            new TransactionClassificationService('Disposable Income', 'Paycheck'),
            createMockAccountScopeService(),
            createMockLogger()
        );

        const failure = build(cashFlow).execute({ month: 5, year: 2024 });

        await expect(failure).rejects.toHaveProperty(
            'message',
            'Failed to fetch transactions for month 5/2024: Request failed with status code 401'
        );
        await expect(failure).rejects.toHaveProperty('cause.cause', fireflyError);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('Unable to retrieve transactions for 5/2024.')
        );
    });

    it('should fail when the bill comparison fails', async () => {
        billComparisonService.calculateBillComparison.mockResolvedValueOnce({
            ok: false,
            error: { message: 'bill error', userMessage: 'Bills unavailable' },
        } as never);

        await expect(build().execute({ month: 5, year: 2024 })).rejects.toThrow('bill error');
    });

    describe('--json', () => {
        let stderrSpy: jest.Spied<typeof process.stderr.write>;

        beforeEach(() => {
            stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
        });

        afterEach(() => {
            stderrSpy.mockRestore();
        });

        it('prints only parseable JSON and skips the text report', async () => {
            const result = await build().execute({ month: 5, year: 2024, format: 'json' });

            expect(analyzeDisplayService.formatAnalysisReport).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            // The spinner is silenced, so nothing reaches stderr either
            expect(stderrSpy).not.toHaveBeenCalled();

            const doc = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
            expect(doc.schemaVersion).toBe(2);
            expect(doc.paycheck).toEqual({ expected: 5000, actual: 5500, variance: 500 });
            expect(doc.budget).toEqual({ allocated: 1840, spent: 1794.94, remaining: 45.06 });
            expect(doc.bills).toEqual({ predicted: 1200, actual: 1250, variance: 50, bills: [] });
            expect(doc.disposable.action).toEqual({ direction: 'fromPool', amount: 150 });
            expect(doc.netCashFlow).toBe(Math.round(result.netImpact * 100) / 100);
        });

        it('still rejects in JSON mode, with the error on stderr only', async () => {
            const cashFlow = createMockCashFlowService();
            cashFlow.getBuckets.mockResolvedValueOnce({
                ok: false,
                error: { message: 'bucket error', userMessage: 'nope' },
            } as never);

            await expect(
                build(cashFlow).execute({ month: 5, year: 2024, format: 'json' })
            ).rejects.toThrow('bucket error');
            expect(consoleLogSpy).not.toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalled();
        });
    });
});
