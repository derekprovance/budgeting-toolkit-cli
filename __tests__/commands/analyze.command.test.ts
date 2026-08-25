import { ITransactionService } from '../../src/services/core/transaction.service.interface.js';
import { ITransactionClassificationService } from '../../src/services/core/transaction-classification.service.interface.js';
import { AnalyzeCommand } from '../../src/commands/analyze.command.js';
import { AdditionalIncomeService } from '../../src/services/additional-income.service.js';
import { UnbudgetedExpenseService } from '../../src/services/unbudgeted-expense.service.js';
import {
    PaycheckAnalysis,
    PaycheckSurplusService,
} from '../../src/services/paycheck-surplus.service.js';
import {
    DisposableIncomeService,
    DisposableIncomeAnalysis,
} from '../../src/services/disposable-income.service.js';
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
    let transactionService: jest.Mocked<ITransactionService>;
    let transactionClassificationService: jest.Mocked<ITransactionClassificationService>;
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
                .fn<() => Promise<Result<PaycheckAnalysis, TransactionAnalysisError>>>()
                .mockResolvedValue({
                    ok: true,
                    value: { actual: 5500.0, expected: 5000.0, surplus: 500.0 },
                }),
        } as unknown as jest.Mocked<PaycheckSurplusService>;

        disposableIncomeService = {
            calculateDisposableIncome: jest
                .fn<() => Promise<Result<DisposableIncomeAnalysis, TransactionAnalysisError>>>()
                .mockResolvedValue({
                    ok: true,
                    value: {
                        transactions: [mockTransaction],
                        balance: 150.0,
                        budgetedTransactions: [],
                    },
                }),
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
            predictedTotal: 1200,
            actualTotal: 1250,
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
        transactionService = {
            getExcludedTransactionsForMonth: jest
                .fn<() => Promise<TransactionSplit[]>>()
                .mockResolvedValue([]),
        } as unknown as jest.Mocked<ITransactionService>;

        transactionClassificationService = {
            hasBudget: jest.fn((t: TransactionSplit) => !!t.budget_id),
        } as unknown as jest.Mocked<ITransactionClassificationService>;

        command = new AnalyzeCommand(
            additionalIncomeService,
            unbudgetedExpenseService,
            paycheckSurplusService,
            disposableIncomeService,
            budgetSurplusService,
            billComparisonService,
            analyzeDisplayService,
            transactionService,
            transactionClassificationService
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
                value: { actual: 0, expected: 0, surplus: 0 },
            });
            disposableIncomeService.calculateDisposableIncome.mockResolvedValueOnce({
                ok: true,
                value: { transactions: [], balance: 0, budgetedTransactions: [] },
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
                predictedTotal: 0,
                actualTotal: 0,
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

    describe('exclusion list vs the server-side budget rollup', () => {
        it('should remove excluded budgeted spending from budgetSpent', async () => {
            // Firefly's insight rollup knows nothing about the local exclusion
            // list, so an excluded transaction carrying a budget is still
            // inside budgetSpent even though every local bucket dropped it
            transactionService.getExcludedTransactionsForMonth.mockResolvedValue([
                { amount: '200.00', type: 'withdrawal', budget_id: 'b1' },
                { amount: '50.00', type: 'withdrawal' }, // no budget: not in the rollup
            ] as never);

            budgetSurplusService.calculateBudgetSurplus.mockResolvedValueOnce({
                ok: true,
                value: { totalAllocated: 1000, totalSpent: 800, surplus: 200 },
            });

            await command.execute({ month: 5, year: 2024, verbose: false });

            const reportData = analyzeDisplayService.formatAnalysisReport.mock.calls[0][0];
            expect(reportData.budgetSpent).toBe(600);
            expect(reportData.budgetSurplus).toBe(400);
        });

        it('should leave budgetSpent alone when nothing was excluded', async () => {
            transactionService.getExcludedTransactionsForMonth.mockResolvedValue([]);
            budgetSurplusService.calculateBudgetSurplus.mockResolvedValueOnce({
                ok: true,
                value: { totalAllocated: 1000, totalSpent: 800, surplus: 200 },
            });

            await command.execute({ month: 5, year: 2024, verbose: false });

            const reportData = analyzeDisplayService.formatAnalysisReport.mock.calls[0][0];
            expect(reportData.budgetSpent).toBe(800);
        });
    });

    describe('disposable income wiring', () => {
        it('should forward budgetedTransactions into the rollup correction', async () => {
            // budgetedTransactions is the LAST positional arg to
            // AnalyzeReportDto.create and carries a default, so dropping it
            // fails silently rather than throwing
            disposableIncomeService.calculateDisposableIncome.mockResolvedValueOnce({
                ok: true,
                value: {
                    transactions: [
                        { amount: '100.00', type: 'withdrawal', budget_id: 'b1' },
                    ] as never,
                    balance: 100,
                    budgetedTransactions: [
                        { amount: '100.00', type: 'withdrawal', budget_id: 'b1' },
                    ] as never,
                },
            });

            await command.execute({ month: 5, year: 2024, verbose: false });

            const reportData = analyzeDisplayService.formatAnalysisReport.mock.calls[0][0];
            expect(reportData.budgetRollupTransactions).toHaveLength(1);
            expect(reportData.budgetRollupCorrection).toBe(100);
        });

        it('should keep disposable spending out of netImpact', async () => {
            disposableIncomeService.calculateDisposableIncome.mockResolvedValueOnce({
                ok: true,
                value: { transactions: [], balance: 250.0, budgetedTransactions: [] },
            });

            await command.execute({ month: 5, year: 2024, verbose: false });

            const reportData = analyzeDisplayService.formatAnalysisReport.mock.calls[0][0];
            const withoutDisposable =
                reportData.actualPaycheck +
                reportData.additionalIncomeTotal -
                reportData.billComparison.actualTotal -
                reportData.budgetSpent -
                reportData.unbudgetedExpenseTotal +
                reportData.budgetRollupCorrection;

            expect(reportData.disposableIncome).toBe(250.0);
            expect(reportData.netImpact).toBeCloseTo(withoutDisposable, 2);
        });
    });
});
