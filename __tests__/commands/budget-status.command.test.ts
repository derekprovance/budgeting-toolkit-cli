import { BudgetStatusCommand } from '../../src/commands/budget-status.command';
import { BudgetStatusService } from '../../src/services/budget-status.service';
import { TransactionService } from '../../src/services/core/transaction.service';
import { BudgetDisplayService } from '../../src/services/budget-display.service';
import { BudgetStatus } from '../../src/types/interface/budget-status.interface';

// Mock services
jest.mock('../../src/services/budget-status.service');
jest.mock('../../src/services/core/transaction.service');
jest.mock('../../src/services/budget-display.service');

describe('BudgetStatusCommand', () => {
  let command: BudgetStatusCommand;
  let budgetStatusService: jest.Mocked<BudgetStatusService>;
  let transactionService: jest.Mocked<TransactionService>;
  let displayService: jest.Mocked<BudgetDisplayService>;
  let consoleLogSpy: jest.SpyInstance;

  const mockBudgetStatuses: BudgetStatus[] = [
    { name: 'Test Budget 1', amount: 1000, spent: -500 },
    { name: 'Test Budget 2', amount: 2000, spent: -1000 },
  ];

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup service mocks
    budgetStatusService = {
      getBudgetStatus: jest.fn().mockResolvedValue(mockBudgetStatuses),
    } as unknown as jest.Mocked<BudgetStatusService>;

    transactionService = {
      getMostRecentTransactionDate: jest.fn().mockResolvedValue(new Date('2024-05-15')),
    } as unknown as jest.Mocked<TransactionService>;

    displayService = {
      formatHeader: jest.fn().mockReturnValue('Formatted Header'),
      formatBudgetItem: jest.fn().mockReturnValue('Formatted Budget Item'),
      formatSummary: jest.fn().mockReturnValue('Formatted Summary'),
      getSpendRateWarning: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<BudgetDisplayService>;

    // Create command instance
    command = new BudgetStatusCommand(budgetStatusService, transactionService, displayService);

    // Spy on console.log
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('execute', () => {
    it('should display budget status for current month', async () => {
      const currentDate = new Date();
      await command.execute({
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear(),
      });

      expect(budgetStatusService.getBudgetStatus).toHaveBeenCalled();
      expect(transactionService.getMostRecentTransactionDate).toHaveBeenCalled();
      expect(displayService.formatHeader).toHaveBeenCalled();
      expect(displayService.formatBudgetItem).toHaveBeenCalledTimes(2);
      expect(displayService.formatSummary).toHaveBeenCalled();
      expect(displayService.getSpendRateWarning).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledTimes(7); // Header + 2 items + separator + summary
    });

    it('should display budget status for non-current month', async () => {
      const currentDate = new Date();
      await command.execute({
        month: currentDate.getMonth(), // Previous month
        year: currentDate.getFullYear(),
      });

      expect(budgetStatusService.getBudgetStatus).toHaveBeenCalled();
      expect(transactionService.getMostRecentTransactionDate).toHaveBeenCalled();
      expect(displayService.formatHeader).toHaveBeenCalled();
      expect(displayService.formatBudgetItem).toHaveBeenCalledTimes(2);
      expect(displayService.formatSummary).toHaveBeenCalled();
      expect(displayService.getSpendRateWarning).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledTimes(7); // Header + 2 items + separator + summary + newline
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