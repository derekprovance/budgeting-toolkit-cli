import { BudgetReportCommand } from '../../src/commands/budget-report.command.js';
import { BudgetAnalyticsService } from '../../src/services/budget-analytics.service.js';
import { BudgetInsightService } from '../../src/services/budget-insight.service.js';
import { EnhancedBudgetDisplayService } from '../../src/services/display/enhanced-budget-display.service.js';
import { BudgetReportService } from '../../src/services/budget-report.service.js';
import { BillComparisonService } from '../../src/services/bill-comparison.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { EnhancedBudgetReportDto } from '../../src/types/dto/enhanced-budget-report.dto.js';
import { BillComparisonDto } from '../../src/types/dto/bill-comparison.dto.js';
import { jest } from '@jest/globals';

// Mock services
jest.mock('../../src/services/budget-analytics.service');
jest.mock('../../src/services/budget-insight.service');
jest.mock('../../src/services/display/enhanced-budget-display.service');
jest.mock('../../src/services/budget-report.service');
jest.mock('../../src/services/bill-comparison.service');
jest.mock('../../src/services/core/transaction.service');

describe('BudgetReportCommand', () => {
    let command: BudgetReportCommand;
    let budgetAnalyticsService: jest.Mocked<BudgetAnalyticsService>;
    let budgetInsightService: jest.Mocked<BudgetInsightService>;
    let enhancedBudgetDisplayService: jest.Mocked<EnhancedBudgetDisplayService>;
    let budgetReportService: jest.Mocked<BudgetReportService>;
    let billComparisonService: jest.Mocked<BillComparisonService>;
    let transactionService: jest.Mocked<TransactionService>;
    let consoleLogSpy: jest.Spied<typeof console.log>;

    const mockEnhancedBudgets: EnhancedBudgetReportDto[] = [
        {
            budgetId: '1',
            name: 'Test Budget 1',
            amount: 1000,
            spent: -500,
            status: 'under',
            percentageUsed: 50,
            remaining: 500,
            historicalComparison: { previousMonthSpent: 400, threeMonthAvg: 450 },
            transactionStats: { count: 5, average: 100 },
        },
        {
            budgetId: '2',
            name: 'Test Budget 2',
            amount: 2000,
            spent: -1000,
            status: 'on-track',
            percentageUsed: 50,
            remaining: 1000,
            historicalComparison: { previousMonthSpent: 900, threeMonthAvg: 950 },
            transactionStats: { count: 8, average: 125 },
        },
    ];

    const mockBillComparison = BillComparisonDto.create(500, 450, [], 'USD', '$');

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup service mocks
        budgetAnalyticsService = {
            getEnhancedBudgetReport: jest
                .fn<
                    (
                        month: number,
                        year: number,
                        historyMonths: number
                    ) => Promise<EnhancedBudgetReportDto[]>
                >()
                .mockResolvedValue(mockEnhancedBudgets),
            getTopExpenses: jest
                .fn<(month: number, year: number, limit: number) => Promise<any>>()
                .mockResolvedValue([]),
        } as unknown as jest.Mocked<BudgetAnalyticsService>;

        budgetInsightService = {
            generateInsights: jest
                .fn<
                    (budgets: EnhancedBudgetReportDto[], billComparison: BillComparisonDto) => any[]
                >()
                .mockReturnValue([]),
        } as unknown as jest.Mocked<BudgetInsightService>;

        enhancedBudgetDisplayService = {
            formatEnhancedReport: jest
                .fn<(reportData: any, verbose?: boolean) => string>()
                .mockReturnValue('Formatted Enhanced Report'),
        } as unknown as jest.Mocked<EnhancedBudgetDisplayService>;

        budgetReportService = {
            getCategorizedUnbudgetedTransactions: jest
                .fn<(month: number, year: number) => Promise<any>>()
                .mockResolvedValue({ unbudgeted: [], categorized: [] }),
        } as unknown as jest.Mocked<BudgetReportService>;

        billComparisonService = {
            calculateBillComparison: jest
                .fn<(month: number, year: number) => Promise<any>>()
                .mockResolvedValue({ ok: true, value: mockBillComparison }),
        } as unknown as jest.Mocked<BillComparisonService>;

        transactionService = {
            getMostRecentTransactionDate: jest
                .fn<() => Promise<Date | null>>()
                .mockResolvedValue(new Date('2024-05-15')),
        } as unknown as jest.Mocked<TransactionService>;

        // Create command instance with new signature
        command = new BudgetReportCommand(
            budgetAnalyticsService,
            budgetInsightService,
            enhancedBudgetDisplayService,
            budgetReportService,
            billComparisonService,
            transactionService
        );

        // Spy on console.log
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
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

            expect(budgetAnalyticsService.getEnhancedBudgetReport).toHaveBeenCalledWith(
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
            expect(enhancedBudgetDisplayService.formatEnhancedReport).toHaveBeenCalled();
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

            expect(budgetAnalyticsService.getEnhancedBudgetReport).toHaveBeenCalled();
            expect(budgetAnalyticsService.getTopExpenses).toHaveBeenCalled();
            expect(enhancedBudgetDisplayService.formatEnhancedReport).toHaveBeenCalled();
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
                mockEnhancedBudgets,
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

            expect(enhancedBudgetDisplayService.formatEnhancedReport).toHaveBeenCalledWith(
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

            expect(enhancedBudgetDisplayService.formatEnhancedReport).toHaveBeenCalledWith(
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

            expect(enhancedBudgetDisplayService.formatEnhancedReport).toHaveBeenCalledWith(
                expect.any(Object),
                false
            );
        });
    });
});
