import { BudgetReportCommand } from '../../src/commands/budget-report.command.js';
import { BudgetAnalyticsService } from '../../src/services/budget-analytics.service.js';
import { BudgetInsightService } from '../../src/services/budget-insight.service.js';
import { BudgetDisplayService } from '../../src/services/display/budget-display.service.js';
import { BillComparisonService } from '../../src/services/bill-comparison.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { CashFlowService } from '../../src/services/cash-flow.service.js';
import { buckets, createMockCashFlowService, partialMock } from '../shared/mocks.js';
import { BudgetReportDto } from '../../src/types/dto/budget-report.dto.js';
import { BillComparisonDto } from '../../src/types/dto/bill-comparison.dto.js';
import { jest } from '@jest/globals';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

describe('BudgetReportCommand', () => {
    let command: BudgetReportCommand;
    let budgetAnalyticsService: jest.Mocked<BudgetAnalyticsService>;
    let budgetInsightService: jest.Mocked<BudgetInsightService>;
    let budgetDisplayService: jest.Mocked<BudgetDisplayService>;
    let billComparisonService: jest.Mocked<BillComparisonService>;
    let transactionService: jest.Mocked<TransactionService>;
    let cashFlowService: jest.Mocked<CashFlowService>;
    let consoleLogSpy: jest.Spied<typeof console.log>;

    const mockBudgets: BudgetReportDto[] = [
        {
            budgetId: '1',
            name: 'Test Budget 1',
            amount: 1000,
            spent: 500,
            status: 'under',
            percentageUsed: 50,
            remaining: 500,
            historicalComparison: { previousMonthSpent: 400, averageSpent: 450 },
            transactionStats: { count: 5, average: 100 },
        },
        {
            budgetId: '2',
            name: 'Test Budget 2',
            amount: 2000,
            spent: 1000,
            status: 'on-track',
            percentageUsed: 50,
            remaining: 1000,
            historicalComparison: { previousMonthSpent: 900, averageSpent: 950 },
            transactionStats: { count: 8, average: 125 },
        },
    ];

    const mockBillComparison = BillComparisonDto.create(500, 450, [], 'USD', '$');

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup service mocks
        budgetAnalyticsService = partialMock<BudgetAnalyticsService>({
            getBudgetReport: jest
                .fn<BudgetAnalyticsService['getBudgetReport']>()
                .mockResolvedValue(mockBudgets),
            getTopExpenses: jest
                .fn<BudgetAnalyticsService['getTopExpenses']>()
                .mockResolvedValue([]),
        });

        budgetInsightService = partialMock<BudgetInsightService>({
            generateInsights: jest
                .fn<BudgetInsightService['generateInsights']>()
                .mockReturnValue([]),
        });

        budgetDisplayService = partialMock<BudgetDisplayService>({
            formatReport: jest
                .fn<BudgetDisplayService['formatReport']>()
                .mockReturnValue('Formatted Enhanced Report'),
        });

        billComparisonService = partialMock<BillComparisonService>({
            calculateBillComparison: jest
                .fn<BillComparisonService['calculateBillComparison']>()
                .mockResolvedValue({ ok: true, value: mockBillComparison }),
        });

        transactionService = partialMock<TransactionService>({
            getMostRecentTransactionDate: jest
                .fn<TransactionService['getMostRecentTransactionDate']>()
                .mockResolvedValue(new Date('2024-05-15')),
        });

        cashFlowService = createMockCashFlowService();

        // Create command instance with new signature
        command = new BudgetReportCommand(
            budgetAnalyticsService,
            budgetInsightService,
            budgetDisplayService,
            billComparisonService,
            transactionService,
            cashFlowService
        );

        // Spy on console.log
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    describe('execute', () => {
        it('should display enhanced budget report for current month', async () => {
            const currentDate = new Date();
            await command.execute({
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear(),
            });

            expect(budgetAnalyticsService.getBudgetReport).toHaveBeenCalledWith(
                currentDate.getMonth() + 1,
                currentDate.getFullYear(),
                1
            );
            expect(budgetAnalyticsService.getTopExpenses).toHaveBeenCalledWith(
                currentDate.getMonth() + 1,
                currentDate.getFullYear(),
                5
            );
            expect(budgetInsightService.generateInsights).toHaveBeenCalled();
            expect(budgetDisplayService.formatReport).toHaveBeenCalled();
            expect(billComparisonService.calculateBillComparison).toHaveBeenCalled();
            expect(transactionService.getMostRecentTransactionDate).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalled();
        });

        it('should display enhanced budget report for non-current month', async () => {
            const currentDate = new Date();
            const prevMonth = currentDate.getMonth() === 0 ? 12 : currentDate.getMonth();
            const prevYear =
                currentDate.getMonth() === 0
                    ? currentDate.getFullYear() - 1
                    : currentDate.getFullYear();

            await command.execute({
                month: prevMonth,
                year: prevYear,
            });

            expect(budgetAnalyticsService.getBudgetReport).toHaveBeenCalled();
            expect(budgetAnalyticsService.getTopExpenses).toHaveBeenCalled();
            expect(budgetDisplayService.formatReport).toHaveBeenCalled();
            expect(billComparisonService.calculateBillComparison).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalled();
        });

        it('should generate insights from budget data', async () => {
            const currentDate = new Date();
            await command.execute({
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear(),
            });

            expect(budgetInsightService.generateInsights).toHaveBeenCalledWith(
                mockBudgets,
                mockBillComparison
            );
        });

        it('should pass verbose flag to display service when provided', async () => {
            const currentDate = new Date();
            await command.execute({
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear(),
                verbose: true,
            });

            expect(budgetDisplayService.formatReport).toHaveBeenCalledWith(
                expect.any(Object),
                true
            );
        });

        it('should default verbose to false when not provided', async () => {
            const currentDate = new Date();
            await command.execute({
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear(),
            });

            expect(budgetDisplayService.formatReport).toHaveBeenCalledWith(
                expect.any(Object),
                false
            );
        });

        it('should pass verbose flag false when explicitly set to false', async () => {
            const currentDate = new Date();
            await command.execute({
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear(),
                verbose: false,
            });

            expect(budgetDisplayService.formatReport).toHaveBeenCalledWith(
                expect.any(Object),
                false
            );
        });
    });
    describe('return value and --json', () => {
        let consoleErrorSpy: jest.Spied<typeof console.error>;
        let stderrSpy: jest.Spied<typeof process.stderr.write>;

        const unbudgetedTx = {
            transaction_journal_id: 'j1',
            description: 'Coffee',
            type: 'withdrawal',
            amount: '4.50',
            date: '2024-05-03T00:00:00+00:00',
            source_id: 'cc',
            destination_id: 'shop',
            budget_id: null,
            bill_id: null,
        } as TransactionSplit;
        beforeEach(() => {
            consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
            cashFlowService.getBuckets.mockResolvedValue({
                ok: true,
                value: buckets({ unbudgeted: [unbudgetedTx] }),
            });
        });

        afterEach(() => {
            consoleErrorSpy.mockRestore();
            stderrSpy.mockRestore();
        });

        it('returns the report data it displayed', async () => {
            const result = await command.execute({ month: 5, year: 2024 });

            expect(result.budgets).toBe(mockBudgets);
            expect(result.billComparison).toBe(mockBillComparison);
            expect(result.unbudgeted).toEqual([unbudgetedTx]);
            expect(result).not.toHaveProperty('untracked');
            expect(result.month).toBe(5);
            expect(result.year).toBe(2024);
            expect(budgetDisplayService.formatReport).toHaveBeenCalledWith(result, false);
        });

        it('prints only the JSON document and skips the text report', async () => {
            const result = await command.execute({ month: 5, year: 2024, format: 'json' });

            expect(budgetDisplayService.formatReport).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            // The spinner is silenced, so nothing reaches stderr either
            expect(stderrSpy).not.toHaveBeenCalled();

            const printed = consoleLogSpy.mock.calls[0][0] as string;
            expect(JSON.parse(printed)).toEqual({
                schemaVersion: 2,
                month: 5,
                year: 2024,
                currencySymbol: '$',
                totals: { spent: 1500, allocated: 3000, percentageUsed: 50 },
                budgets: [
                    {
                        id: '1',
                        name: 'Test Budget 1',
                        allocated: 1000,
                        spent: 500,
                        remaining: 500,
                        percentageUsed: 50,
                        status: 'under',
                        previousMonthSpent: 400,
                        averageSpent: 450,
                    },
                    {
                        id: '2',
                        name: 'Test Budget 2',
                        allocated: 2000,
                        spent: 1000,
                        remaining: 1000,
                        percentageUsed: 50,
                        status: 'on-track',
                        previousMonthSpent: 900,
                        averageSpent: 950,
                    },
                ],
                bills: { predicted: 500, actual: 450, variance: -50 },
                unbudgetedExpenses: {
                    total: 4.5,
                    transactions: [
                        {
                            journalId: 'j1',
                            description: 'Coffee',
                            type: 'withdrawal',
                            amount: 4.5,
                            date: '2024-05-03T00:00:00+00:00',
                            sourceId: 'cc',
                            destinationId: 'shop',
                            budgetId: null,
                            billId: null,
                        },
                    ],
                },
            });
            expect(printed).toBe(JSON.stringify(JSON.parse(printed), null, 2));
            expect(result.budgets).toBe(mockBudgets);
        });

        it('sends the bill-comparison warning to stderr in JSON mode', async () => {
            billComparisonService.calculateBillComparison.mockResolvedValue({
                ok: false,
                error: { message: 'bills down', userMessage: 'bills down' } as never,
            });

            await command.execute({ month: 5, year: 2024, format: 'json' });

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Warning: Bill comparison data unavailable'
            );
            expect(consoleLogSpy).toHaveBeenCalledTimes(1);
            expect(() => JSON.parse(consoleLogSpy.mock.calls[0][0] as string)).not.toThrow();
        });

        it('still rejects in JSON mode when a required calculation fails', async () => {
            cashFlowService.getBuckets.mockResolvedValue({
                ok: false,
                error: { message: 'bucketing failed', userMessage: 'nope' } as never,
            });

            await expect(command.execute({ month: 5, year: 2024, format: 'json' })).rejects.toThrow(
                'bucketing failed'
            );
            expect(consoleLogSpy).not.toHaveBeenCalled();
        });
    });
});
