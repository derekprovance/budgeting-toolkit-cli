import { FinalizeBudgetCommand } from '../../src/commands/finalize-budget.command.js';
import { AdditionalIncomeService } from '../../src/services/additional-income.service.js';
import { UnbudgetedExpenseService } from '../../src/services/unbudgeted-expense.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { PaycheckSurplusService } from '../../src/services/paycheck-surplus.service.js';
import { FinalizeBudgetDisplayService } from '../../src/services/display/finalize-budget-display.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';

// Mock services
jest.mock('../../src/services/additional-income.service');
jest.mock('../../src/services/unbudgeted-expense.service');
jest.mock('../../src/services/core/transaction-classification.service');
jest.mock('../../src/services/display/finalize-budget-display.service');
jest.mock('../../src/services/paycheck-surplus.service');

describe('FinalizeBudgetCommand', () => {
    let command: FinalizeBudgetCommand;
    let additionalIncomeService: jest.Mocked<AdditionalIncomeService>;
    let unbudgetedExpenseService: jest.Mocked<UnbudgetedExpenseService>;
    let transactionClassificationService: jest.Mocked<TransactionClassificationService>;
    let paycheckSurplusService: jest.Mocked<PaycheckSurplusService>;
    let finalizeBudgetDisplayService: jest.Mocked<FinalizeBudgetDisplayService>;
    let consoleLogSpy: jest.Spied<typeof console.log>;
    let consoleErrorSpy: jest.Spied<typeof console.error>;

    const mockTransaction: Partial<TransactionSplit> = {
        description: 'Test Transaction',
        amount: '100.00',
        date: '2024-05-15',
        currency_symbol: '$',
        category_name: 'Test Category',
    };

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup service mocks - now returning Result types
        additionalIncomeService = {
            calculateAdditionalIncome: jest
                .fn()
                .mockResolvedValue({ ok: true, value: [mockTransaction] }),
        } as unknown as jest.Mocked<AdditionalIncomeService>;

        unbudgetedExpenseService = {
            calculateUnbudgetedExpenses: jest
                .fn()
                .mockResolvedValue({ ok: true, value: [mockTransaction] }),
        } as unknown as jest.Mocked<UnbudgetedExpenseService>;

        transactionClassificationService = {
            isBill: jest.fn<(transaction: TransactionSplit) => boolean>().mockReturnValue(false),
            isTransfer: jest
                .fn<(transaction: TransactionSplit) => boolean>()
                .mockReturnValue(false),
            isDeposit: jest.fn<(transaction: TransactionSplit) => boolean>().mockReturnValue(false),
        } as unknown as jest.Mocked<TransactionClassificationService>;

        paycheckSurplusService = {
            calculatePaycheckSurplus: jest.fn().mockResolvedValue({ ok: true, value: 500.0 }),
        } as unknown as jest.Mocked<PaycheckSurplusService>;

        finalizeBudgetDisplayService = {
            formatHeader: jest.fn().mockReturnValue('Mock Header'),
            formatMonthHeader: jest.fn().mockReturnValue('Mock Month Header'),
            formatAdditionalIncomeSection: jest.fn().mockReturnValue('Mock Additional Income'),
            formatUnbudgetedExpensesSection: jest.fn().mockReturnValue('Mock Unbudgeted Expenses'),
            formatSummary: jest.fn().mockReturnValue('Mock Summary'),
        } as unknown as jest.Mocked<FinalizeBudgetDisplayService>;

        // Create command instance
        command = new FinalizeBudgetCommand(
            additionalIncomeService,
            unbudgetedExpenseService,
            transactionClassificationService,
            paycheckSurplusService,
            finalizeBudgetDisplayService
        );

        // Spy on console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('execute', () => {
        it('should execute successfully with data', async () => {
            await command.execute({ month: 5, year: 2024 });

            expect(additionalIncomeService.calculateAdditionalIncome).toHaveBeenCalledWith(5, 2024);
            expect(unbudgetedExpenseService.calculateUnbudgetedExpenses).toHaveBeenCalledWith(
                5,
                2024
            );
            expect(paycheckSurplusService.calculatePaycheckSurplus).toHaveBeenCalledWith(5, 2024);
            expect(consoleLogSpy).toHaveBeenCalled();
            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });

        it('should execute successfully with no data', async () => {
            additionalIncomeService.calculateAdditionalIncome.mockResolvedValueOnce({
                ok: true,
                value: [],
            });
            unbudgetedExpenseService.calculateUnbudgetedExpenses.mockResolvedValueOnce({
                ok: true,
                value: [],
            });
            paycheckSurplusService.calculatePaycheckSurplus.mockResolvedValueOnce({
                ok: true,
                value: 0,
            });

            await command.execute({ month: 5, year: 2024 });

            expect(additionalIncomeService.calculateAdditionalIncome).toHaveBeenCalledWith(5, 2024);
            expect(unbudgetedExpenseService.calculateUnbudgetedExpenses).toHaveBeenCalledWith(
                5,
                2024
            );
            expect(paycheckSurplusService.calculatePaycheckSurplus).toHaveBeenCalledWith(5, 2024);
            expect(consoleLogSpy).toHaveBeenCalled();
            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });

        it('should handle errors from additional income service', async () => {
            const error = {
                ok: false,
                error: {
                    message: 'Additional income error',
                    userMessage: 'Failed to calculate additional income',
                },
            };
            additionalIncomeService.calculateAdditionalIncome.mockResolvedValueOnce(error as any);

            await expect(command.execute({ month: 5, year: 2024 })).rejects.toThrow(
                'Additional income error'
            );

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error fetching additional income'),
                expect.stringContaining('Failed to calculate additional income')
            );
        });

        it('should handle errors from unbudgeted expense service', async () => {
            const error = {
                ok: false,
                error: {
                    message: 'Unbudgeted expense error',
                    userMessage: 'Failed to calculate unbudgeted expenses',
                },
            };
            unbudgetedExpenseService.calculateUnbudgetedExpenses.mockResolvedValueOnce(
                error as any
            );

            await expect(command.execute({ month: 5, year: 2024 })).rejects.toThrow(
                'Unbudgeted expense error'
            );

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error fetching unbudgeted expenses'),
                expect.stringContaining('Failed to calculate unbudgeted expenses')
            );
        });

        it('should handle errors from paycheck surplus service', async () => {
            const error = {
                ok: false,
                error: {
                    message: 'Paycheck surplus error',
                    userMessage: 'Failed to calculate paycheck surplus',
                },
            };
            paycheckSurplusService.calculatePaycheckSurplus.mockResolvedValueOnce(error as any);

            await expect(command.execute({ month: 5, year: 2024 })).rejects.toThrow(
                'Paycheck surplus error'
            );

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error calculating paycheck surplus'),
                expect.stringContaining('Failed to calculate paycheck surplus')
            );
        });
    });
});
