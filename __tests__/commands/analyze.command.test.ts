import { AnalyzeCommand } from '../../src/commands/analyze.command.js';
import { AdditionalIncomeService } from '../../src/services/additional-income.service.js';
import { UnbudgetedExpenseService } from '../../src/services/unbudgeted-expense.service.js';
import { PaycheckSurplusService } from '../../src/services/paycheck-surplus.service.js';
import { DisposableIncomeService } from '../../src/services/disposable-income.service.js';
import {
    BudgetSurplusService,
    BudgetSurplusResult,
} from '../../src/services/budget-surplus.service.js';
import { BillComparisonService } from '../../src/services/bill-comparison.service.js';
import { AnalyzeDisplayService } from '../../src/services/display/analyze-display.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BillComparisonDto } from '../../src/types/dto/bill-comparison.dto.js';
import { jest } from '@jest/globals';
import { Result } from '../../src/types/result.type.js';
import { TransactionAnalysisError } from '../../src/types/error/transaction-analysis.error.js';
import { BudgetError } from '../../src/types/error/budget.error.js';
import { BillError } from '../../src/types/error/bill.error.js';

// Mock services
jest.mock('../../src/services/additional-income.service');
jest.mock('../../src/services/unbudgeted-expense.service');
jest.mock('../../src/services/display/analyze-display.service');
jest.mock('../../src/services/paycheck-surplus.service');
jest.mock('../../src/services/disposable-income.service');
jest.mock('../../src/services/budget-surplus.service');
jest.mock('../../src/services/bill-comparison.service');

describe('AnalyzeCommand', () => {
    let command: AnalyzeCommand;
    let additionalIncomeService: jest.Mocked<AdditionalIncomeService>;
    let unbudgetedExpenseService: jest.Mocked<UnbudgetedExpenseService>;
    let paycheckSurplusService: jest.Mocked<PaycheckSurplusService>;
    let disposableIncomeService: jest.Mocked<DisposableIncomeService>;
    let budgetSurplusService: jest.Mocked<BudgetSurplusService>;
    let billComparisonService: jest.Mocked<BillComparisonService>;
    let analyzeDisplayService: jest.Mocked<AnalyzeDisplayService>;
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

        // Setup service mocks
        additionalIncomeService = {
            calculateAdditionalIncome: jest
                .fn<() => Promise<Result<TransactionSplit[], TransactionAnalysisError>>>()
                .mockResolvedValue({ ok: true, value: [mockTransaction] }),
        } as unknown as jest.Mocked<AdditionalIncomeService>;

        unbudgetedExpenseService = {
            calculateUnbudgetedExpenses: jest
                .fn<() => Promise<Result<TransactionSplit[], TransactionAnalysisError>>>()
                .mockResolvedValue({ ok: true, value: [mockTransaction] }),
        } as unknown as jest.Mocked<UnbudgetedExpenseService>;

        paycheckSurplusService = {
            calculatePaycheckSurplus: jest
                .fn<() => Promise<Result<number, TransactionAnalysisError>>>()
                .mockResolvedValue({ ok: true, value: 500.0 }),
        } as unknown as jest.Mocked<PaycheckSurplusService>;

        disposableIncomeService = {
            calculateDisposableIncome: jest
                .fn<() => Promise<Result<number, TransactionAnalysisError>>>()
                .mockResolvedValue({ ok: true, value: 150.0 }),
        } as unknown as jest.Mocked<DisposableIncomeService>;

        const mockBudgetSurplusResult: BudgetSurplusResult = {
            totalAllocated: 1840,
            totalSpent: 1794.94,
            surplus: 45.06,
        };

        budgetSurplusService = {
            calculateBudgetSurplus: jest
                .fn<() => Promise<Result<BudgetSurplusResult, BudgetError>>>()
                .mockResolvedValue({ ok: true, value: mockBudgetSurplusResult }),
        } as unknown as jest.Mocked<BudgetSurplusService>;

        const mockBillComparison: BillComparisonDto = {
            predictedMonthlyAverage: 1200,
            actualMonthlyTotal: 1250,
            variance: 50,
            bills: [],
            currencyCode: 'USD',
            currencySymbol: '$',
        };

        billComparisonService = {
            calculateBillComparison: jest
                .fn<() => Promise<Result<BillComparisonDto, BillError>>>()
                .mockResolvedValue({ ok: true, value: mockBillComparison }),
        } as unknown as jest.Mocked<BillComparisonService>;

        analyzeDisplayService = {
            formatAnalysisReport: jest.fn().mockReturnValue('Mock Analysis Report'),
        } as unknown as jest.Mocked<AnalyzeDisplayService>;

        // Create command instance
        command = new AnalyzeCommand(
            additionalIncomeService,
            unbudgetedExpenseService,
            paycheckSurplusService,
            disposableIncomeService,
            budgetSurplusService,
            billComparisonService,
            analyzeDisplayService
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
            expect(disposableIncomeService.calculateDisposableIncome).toHaveBeenCalledWith(5, 2024);
            expect(budgetSurplusService.calculateBudgetSurplus).toHaveBeenCalledWith(5, 2024);
            expect(billComparisonService.calculateBillComparison).toHaveBeenCalledWith(5, 2024);
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
            disposableIncomeService.calculateDisposableIncome.mockResolvedValueOnce({
                ok: true,
                value: 0,
            });
            const emptyBudgetSurplusResult: BudgetSurplusResult = {
                totalAllocated: 0,
                totalSpent: 0,
                surplus: 0,
            };
            budgetSurplusService.calculateBudgetSurplus.mockResolvedValueOnce({
                ok: true,
                value: emptyBudgetSurplusResult,
            });
            const emptyBillComparison: BillComparisonDto = {
                predictedMonthlyAverage: 0,
                actualMonthlyTotal: 0,
                variance: 0,
                bills: [],
                currencyCode: 'USD',
                currencySymbol: '$',
            };
            billComparisonService.calculateBillComparison.mockResolvedValueOnce({
                ok: true,
                value: emptyBillComparison,
            });

            await command.execute({ month: 5, year: 2024 });

            expect(additionalIncomeService.calculateAdditionalIncome).toHaveBeenCalledWith(5, 2024);
            expect(unbudgetedExpenseService.calculateUnbudgetedExpenses).toHaveBeenCalledWith(
                5,
                2024
            );
            expect(paycheckSurplusService.calculatePaycheckSurplus).toHaveBeenCalledWith(5, 2024);
            expect(disposableIncomeService.calculateDisposableIncome).toHaveBeenCalledWith(5, 2024);
            expect(budgetSurplusService.calculateBudgetSurplus).toHaveBeenCalledWith(5, 2024);
            expect(billComparisonService.calculateBillComparison).toHaveBeenCalledWith(5, 2024);
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
