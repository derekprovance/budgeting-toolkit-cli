import { BudgetReportCommand } from '../../src/commands/budget-report.command';
import { BudgetReportService } from '../../src/services/budget-report.service';
import { TransactionService } from '../../src/services/core/transaction.service';
import { BudgetDisplayService } from '../../src/services/display/budget-display.service';
import { BudgetReport } from '../../src/types/interface/budget-report.interface';

// Mock services
jest.mock('../../src/services/budget-report.service');
jest.mock('../../src/services/core/transaction.service');
jest.mock('../../src/services/display/budget-display.service');

describe('BudgetReportCommand', () => {
    let command: BudgetReportCommand;
    let BudgetReportService: jest.Mocked<BudgetReportService>;
    let transactionService: jest.Mocked<TransactionService>;
    let displayService: jest.Mocked<BudgetDisplayService>;
    let consoleLogSpy: jest.SpyInstance;

    const mockBudgetStatuses: BudgetReport[] = [
        { name: 'Test Budget 1', amount: 1000, spent: -500 },
        { name: 'Test Budget 2', amount: 2000, spent: -1000 },
    ];

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup service mocks
        BudgetReportService = {
            getBudgetStatus: jest.fn().mockResolvedValue(mockBudgetStatuses),
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
        } as unknown as jest.Mocked<BudgetDisplayService>;

        // Create command instance
        command = new BudgetReportCommand(BudgetReportService, transactionService, displayService);

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

            expect(BudgetReportService.getBudgetStatus).toHaveBeenCalled();
            expect(transactionService.getMostRecentTransactionDate).toHaveBeenCalled();
            expect(displayService.formatHeader).toHaveBeenCalled();
            expect(displayService.formatBudgetItem).toHaveBeenCalledTimes(2);
            expect(displayService.formatSummary).toHaveBeenCalled();
            expect(displayService.getSpendRateWarning).toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledTimes(8); // Header + 2 items + separator + summary + unbudgeted
        });

        it('should display budget report for non-current month', async () => {
            const currentDate = new Date();
            await command.execute({
                month: currentDate.getMonth(), // Previous month
                year: currentDate.getFullYear(),
            });

            expect(BudgetReportService.getBudgetStatus).toHaveBeenCalled();
            expect(transactionService.getMostRecentTransactionDate).toHaveBeenCalled();
            expect(displayService.formatHeader).toHaveBeenCalled();
            expect(displayService.formatBudgetItem).toHaveBeenCalledTimes(2);
            expect(displayService.formatSummary).toHaveBeenCalled();
            expect(displayService.getSpendRateWarning).not.toHaveBeenCalled();
            expect(consoleLogSpy).toHaveBeenCalledTimes(8); // Header + 2 items + separator + summary + newline + unbudgeted
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
