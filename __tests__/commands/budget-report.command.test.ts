import { BudgetReportCommand } from '../../src/commands/budget-report.command';
import { BudgetReportService } from '../../src/services/budget-report.service';
import { TransactionService } from '../../src/services/core/transaction.service';
import { BudgetDisplayService } from '../../src/services/display/budget-display.service';
import { BillComparisonService } from '../../src/services/bill-comparison.service';
import { BudgetReport } from '../../src/types/interface/budget-report.interface';
import { BillComparisonDto } from '../../src/types/dto/bill-comparison.dto';

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
    let consoleLogSpy: jest.SpyInstance;

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
            getBudgetReport: jest.fn().mockResolvedValue(mockBudgetReports),
            getUntrackedTransactions: jest.fn().mockResolvedValue([]),
        } as unknown as jest.Mocked<BudgetReportService>;

        transactionService = {
            getMostRecentTransactionDate: jest.fn().mockResolvedValue(new Date('2024-05-15')),
        } as unknown as jest.Mocked<TransactionService>;

        displayService = {
            formatHeader: jest.fn().mockReturnValue('Formatted Header'),
            formatBudgetItem: jest.fn().mockReturnValue('Formatted Budget Item'),
            formatSummary: jest.fn().mockReturnValue('Formatted Summary'),
            getSpendRateWarning: jest.fn().mockReturnValue(null),
            getUnbudgetedExpenseWarning: jest.fn().mockReturnValue(null),
            listUnbudgetedTransactions: jest.fn().mockReturnValue('Unbudgeted Transactions'),
            formatBillComparisonSection: jest.fn().mockReturnValue('Bill Comparison'),
        } as unknown as jest.Mocked<BudgetDisplayService>;

        billComparisonService = {
            calculateBillComparison: jest.fn().mockResolvedValue(mockBillComparison),
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
