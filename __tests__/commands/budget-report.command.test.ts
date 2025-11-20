import { BudgetReportCommand } from '../../src/commands/budget-report.command.js';
import { BudgetReportService } from '../../src/services/budget-report.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { BudgetDisplayService } from '../../src/services/display/budget-display.service.js';
import { BillComparisonService } from '../../src/services/bill-comparison.service.js';
import { BudgetReport } from '../../src/types/interface/budget-report.interface.js';
import { BillComparisonDto } from '../../src/types/dto/bill-comparison.dto.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';

// Mock services
jest.mock('../../src/services/budget-report.service');
jest.mock('../../src/services/core/transaction.service');
jest.mock('../../src/services/display/budget-display.service');
jest.mock('../../src/services/bill-comparison.service');

describe('BudgetReportCommand', () => {
    let command: BudgetReportCommand;
    let budgetReportService: jest.Mocked<BudgetReportService>;
    let transactionService: jest.Mocked<TransactionService>;
    let displayService: jest.Mocked<BudgetDisplayService>;
    let billComparisonService: jest.Mocked<BillComparisonService>;
    let consoleLogSpy: jest.Spied<typeof console.log>;

    const mockBudgetReports: BudgetReport[] = [
        { name: 'Test Budget 1', amount: 1000, spent: -500 },
        { name: 'Test Budget 2', amount: 2000, spent: -1000 },
    ];

    const mockBillComparison = BillComparisonDto.create(500, 450, [], 'USD', '$');

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup service mocks
        budgetReportService = {
            getBudgetReport: jest
                .fn<() => Promise<BudgetReport[]>>()
                .mockResolvedValue(mockBudgetReports),
            getUntrackedTransactions: jest
                .fn<() => Promise<TransactionSplit[]>>()
                .mockResolvedValue([]),
        } as unknown as jest.Mocked<BudgetReportService>;

        transactionService = {
            getMostRecentTransactionDate: jest
                .fn<() => Promise<Date | null>>()
                .mockResolvedValue(new Date('2024-05-15')),
        } as unknown as jest.Mocked<TransactionService>;

        displayService = {
            formatHeader: jest.fn<(...args: any[]) => string>().mockReturnValue('Formatted Header'),
            formatBudgetItem: jest
                .fn<(...args: any[]) => string>()
                .mockReturnValue('Formatted Budget Item'),
            formatSummary: jest
                .fn<(...args: any[]) => string>()
                .mockReturnValue('Formatted Summary'),
            getSpendRateWarning: jest.fn<(...args: any[]) => string | null>().mockReturnValue(null),
            getUnbudgetedExpenseWarning: jest
                .fn<(total: number) => string | null>()
                .mockReturnValue(null),
            listUnbudgetedTransactions: jest
                .fn<(transactions: TransactionSplit[]) => string>()
                .mockReturnValue('Unbudgeted Transactions'),
            formatBillComparisonSection: jest
                .fn<(comparison: BillComparisonDto, verbose?: boolean) => string>()
                .mockReturnValue('Bill Comparison'),
        } as unknown as jest.Mocked<BudgetDisplayService>;

        billComparisonService = {
            calculateBillComparison: jest
                .fn<(month: number, year: number) => Promise<BillComparisonDto>>()
                .mockResolvedValue(mockBillComparison),
        } as unknown as jest.Mocked<BillComparisonService>;

        // Create command instance
        command = new BudgetReportCommand(
            budgetReportService,
            transactionService,
            displayService,
            billComparisonService
        );

        // Spy on console.log
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    describe('execute', () => {
        it('should display budget report for current month', async () => {
            const currentDate = new Date();
            await command.execute({
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear(),
            });

            expect(budgetReportService.getBudgetReport).toHaveBeenCalled();
            expect(transactionService.getMostRecentTransactionDate).toHaveBeenCalled();
            expect(displayService.formatHeader).toHaveBeenCalled();
            expect(displayService.formatBudgetItem).toHaveBeenCalledTimes(2);
            expect(displayService.formatSummary).toHaveBeenCalled();
            expect(displayService.getSpendRateWarning).toHaveBeenCalled();
            expect(billComparisonService.calculateBillComparison).toHaveBeenCalled();
            expect(displayService.formatBillComparisonSection).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledTimes(9); // Header + 2 items + separator + summary + unbudgeted + bill comparison
        });

        it('should display budget report for non-current month', async () => {
            const currentDate = new Date();
            await command.execute({
                month: currentDate.getMonth(), // Previous month
                year: currentDate.getFullYear(),
            });

            expect(budgetReportService.getBudgetReport).toHaveBeenCalled();
            expect(transactionService.getMostRecentTransactionDate).toHaveBeenCalled();
            expect(displayService.formatHeader).toHaveBeenCalled();
            expect(displayService.formatBudgetItem).toHaveBeenCalledTimes(2);
            expect(displayService.formatSummary).toHaveBeenCalled();
            expect(displayService.getSpendRateWarning).not.toHaveBeenCalled();
            expect(billComparisonService.calculateBillComparison).toHaveBeenCalled();
            expect(displayService.formatBillComparisonSection).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledTimes(9); // Header + 2 items + separator + summary + newline + unbudgeted + bill comparison
        });

        it('should display warning when spend rate is too high', async () => {
            displayService.getSpendRateWarning.mockReturnValueOnce('Warning Message');

            const currentDate = new Date();
            await command.execute({
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear(),
            });

            expect(displayService.getSpendRateWarning).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledWith('Warning Message');
        });
    });
});
