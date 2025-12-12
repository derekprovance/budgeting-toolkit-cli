import { jest } from '@jest/globals';
import { AnalyzeDisplayService } from '../../../src/services/display/analyze-display.service.js';
import { TransactionClassificationService } from '../../../src/services/core/transaction-classification.service.js';
import { ExcludedTransactionService } from '../../../src/services/excluded-transaction.service.js';
import { AnalyzeReportDto } from '../../../src/types/dto/analyze-report.dto.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import stripAnsi from 'strip-ansi';

// Mock chalk to return the input string (disable styling for tests)
jest.mock('chalk', () => ({
    default: {
        redBright: (str: string) => str,
        cyan: (str: string) => str,
        yellow: (str: string) => str,
        gray: (str: string) => str,
        dim: (str: string) => str,
        bold: (str: string) => str,
        green: (str: string) => str,
        red: (str: string) => str,
        cyanBright: (str: string) => str,
        blueBright: (str: string) => str,
        white: (str: string) => str,
    },
}));

jest.mock('../../../src/services/core/transaction-classification.service');
jest.mock('../../../src/services/excluded-transaction.service');

describe('AnalyzeDisplayService', () => {
    let service: AnalyzeDisplayService;
    let transactionClassificationService: jest.Mocked<TransactionClassificationService>;
    let excludedTransactionService: jest.Mocked<ExcludedTransactionService>;

    beforeEach(() => {
        excludedTransactionService =
            new ExcludedTransactionService() as jest.Mocked<ExcludedTransactionService>;
        transactionClassificationService = new TransactionClassificationService(
            excludedTransactionService
        ) as jest.Mocked<TransactionClassificationService>;

        service = new AnalyzeDisplayService(transactionClassificationService);
    });

    const createMockTransaction = (
        description: string,
        amount: number,
        type: 'deposit' | 'withdrawal' | 'transfer' = 'deposit'
    ): TransactionSplit => ({
        description,
        amount: amount.toString(),
        type,
        date: '2025-11-15T00:00:00Z',
        source_name: 'Test Source',
        destination_name: 'Test Destination',
        currency_code: 'USD',
    });

    const createBasicReportData = (): AnalyzeReportDto => ({
        month: 11,
        year: 2025,
        currencySymbol: '$',
        currencyCode: 'USD',
        additionalIncome: [],
        additionalIncomeTotal: 0,
        unbudgetedExpenses: [],
        unbudgetedExpenseTotal: 0,
        paycheckSurplus: 0,
        expectedMonthlyPaycheck: 5000,
        actualPaycheck: 5000,
        budgetAllocated: 2000,
        budgetSpent: 1500,
        budgetSurplus: 500,
        disposableIncomeTransactions: [],
        disposableIncomeTransfers: [],
        disposableIncome: 0,
        billComparison: {
            predictedTotal: 1000,
            actualTotal: 950,
            variance: -50,
            bills: [],
            currencyCode: 'USD',
            currencySymbol: '$',
        },
        netImpact: 0,
        skipPaycheck: false,
    });

    describe('formatAnalysisReport', () => {
        it('should format complete report with all sections', () => {
            const data = createBasicReportData();
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Budget Finalization Report');
            expect(result).toContain('November 2025');
            expect(result).toContain('INCOME SOURCES');
            expect(result).toContain('EXPENSES & SPENDING');
            expect(result).toContain('PAYCHECK ANALYSIS');
            expect(result).toContain('FINANCIAL SUMMARY');
            expect(result).toContain('RECOMMENDATIONS');
        });

        it('should skip paycheck section when skipPaycheck is true', () => {
            const data = { ...createBasicReportData(), skipPaycheck: true };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Budget Finalization Report');
            expect(result).not.toContain('PAYCHECK ANALYSIS');
            expect(result).toContain('FINANCIAL SUMMARY');
        });

        it('should include transaction details in verbose mode', () => {
            const data = {
                ...createBasicReportData(),
                additionalIncome: [createMockTransaction('Bonus Payment', 500)],
                additionalIncomeTotal: 500,
                unbudgetedExpenses: [createMockTransaction('Emergency Repair', 200, 'withdrawal')],
                unbudgetedExpenseTotal: 200,
            };
            const result = service.formatAnalysisReport(data, true);

            expect(result).toContain('Bonus Payment');
            expect(result).toContain('Emergency Repair');
        });

        it('should not include transaction details in non-verbose mode', () => {
            const data = {
                ...createBasicReportData(),
                additionalIncome: [createMockTransaction('Bonus Payment', 500)],
                additionalIncomeTotal: 500,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).not.toContain('Bonus Payment');
            expect(result).toContain('Additional Income');
        });

        it('should format header correctly for short month names', () => {
            const data = { ...createBasicReportData(), month: 5 }; // May
            const result = service.formatAnalysisReport(data, false);
            const strippedResult = stripAnsi(result);

            expect(strippedResult).toContain('Budget Finalization Report + May 2025');
        });

        it('should format header correctly for long month names', () => {
            const data = { ...createBasicReportData(), month: 9 }; // September
            const result = service.formatAnalysisReport(data, false);
            const strippedResult = stripAnsi(result);

            expect(strippedResult).toContain('Budget Finalization Report + September 2025');
        });
    });

    describe('Summary Section Padding Alignment', () => {
        it('should align all summary labels consistently', () => {
            const data = {
                ...createBasicReportData(),
                additionalIncomeTotal: 100,
                paycheckSurplus: 200,
                budgetSurplus: 300,
                billComparison: {
                    ...createBasicReportData().billComparison,
                    variance: 50,
                },
                unbudgetedExpenseTotal: 150,
            };
            const result = service.formatAnalysisReport(data, false);

            // All labels should be padded to 30 characters
            expect(result).toContain('Additional Income:'.padEnd(30));
            expect(result).toContain('Paycheck Variance:'.padEnd(30));
            expect(result).toContain('Budget Surplus:'.padEnd(30));
            expect(result).toContain('Bill Variance:'.padEnd(30));
            expect(result).toContain('Unbudgeted Expenses:'.padEnd(30));
        });

        it('should align summary labels when paycheck is skipped', () => {
            const data = {
                ...createBasicReportData(),
                skipPaycheck: true,
                additionalIncomeTotal: 100,
                budgetSurplus: 300,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Additional Income:'.padEnd(30));
            expect(result).not.toContain('Paycheck Variance:');
            expect(result).toContain('Budget Surplus:'.padEnd(30));
        });

        it('should align disposable spending when present', () => {
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [
                    createMockTransaction('Disposable expense', 500, 'withdrawal'),
                ],
                disposableIncome: 500,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Disposable Spending:'.padEnd(30));
        });
    });

    describe('Income Section', () => {
        it('should format income section with transaction count', () => {
            const data = {
                ...createBasicReportData(),
                additionalIncome: [
                    createMockTransaction('Income 1', 100),
                    createMockTransaction('Income 2', 200),
                ],
                additionalIncomeTotal: 300,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Additional Income');
            expect(result).toContain('$300.00');
            expect(result).toContain('[2 transactions]');
        });

        it('should format income section with single transaction', () => {
            const data = {
                ...createBasicReportData(),
                additionalIncome: [createMockTransaction('Bonus', 500)],
                additionalIncomeTotal: 500,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('[1 transaction]');
        });
    });

    describe('Expenses Section', () => {
        it('should format unbudgeted expenses with transaction count', () => {
            const data = {
                ...createBasicReportData(),
                unbudgetedExpenses: [
                    createMockTransaction('Expense 1', 100, 'withdrawal'),
                    createMockTransaction('Expense 2', 150, 'withdrawal'),
                ],
                unbudgetedExpenseTotal: 250,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Unbudgeted Expenses');
            expect(result).toContain('$250.00');
            expect(result).toContain('[2 transactions]');
        });

        it('should include budget allocation subsection', () => {
            const data = {
                ...createBasicReportData(),
                budgetAllocated: 2000,
                budgetSpent: 1500,
                budgetSurplus: 500,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Budget Allocation');
            expect(result).toContain('Allocated:');
            expect(result).toContain('$2000.00');
            expect(result).toContain('Spent:');
            expect(result).toContain('$1500.00');
            expect(result).toContain('Remaining:');
            expect(result).toContain('$500.00');
        });

        it('should include bills performance subsection', () => {
            const data = createBasicReportData();
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Bills Performance');
            expect(result).toContain('Predicted:');
            expect(result).toContain('$1000.00');
            expect(result).toContain('Actual:');
            expect(result).toContain('$950.00');
            expect(result).toContain('Variance:');
        });

        it('should include disposable income when present', () => {
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [
                    createMockTransaction('Disposable expense', 300, 'withdrawal'),
                ],
                disposableIncome: 300,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Disposable Income');
            expect(result).toContain('$300.00');
        });

        it('should not include disposable income when zero', () => {
            const data = createBasicReportData();
            const result = service.formatAnalysisReport(data, false);

            expect(result).not.toContain('Disposable Income');
        });
    });

    describe('Paycheck Analysis Section', () => {
        it('should format paycheck analysis with expected and actual values', () => {
            const data = {
                ...createBasicReportData(),
                expectedMonthlyPaycheck: 5000,
                actualPaycheck: 5200,
                paycheckSurplus: 200,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('PAYCHECK ANALYSIS');
            expect(result).toContain('Expected:');
            expect(result).toContain('$5000.00');
            expect(result).toContain('Actual:');
            expect(result).toContain('$5200.00');
            expect(result).toContain('Variance:');
            expect(result).toContain('$200.00');
        });

        it('should handle negative paycheck variance', () => {
            const data = {
                ...createBasicReportData(),
                expectedMonthlyPaycheck: 5000,
                actualPaycheck: 4800,
                paycheckSurplus: -200,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('PAYCHECK ANALYSIS');
            expect(result).toContain('Variance:');
        });
    });

    describe('Financial Summary Section', () => {
        it('should calculate and display net position correctly', () => {
            const data = {
                ...createBasicReportData(),
                additionalIncomeTotal: 100,
                paycheckSurplus: 200,
                budgetSurplus: 300,
                billComparison: {
                    ...createBasicReportData().billComparison,
                    variance: 50,
                },
                unbudgetedExpenseTotal: 150,
                disposableIncome: 0,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('FINANCIAL SUMMARY');
            expect(result).toContain('Net Impact');
            expect(result).toContain('Total Adjustments:');
            expect(result).toContain('Net Position:');
        });

        it('should exclude paycheck variance from net position when skipped', () => {
            const data = {
                ...createBasicReportData(),
                skipPaycheck: true,
                additionalIncomeTotal: 100,
                budgetSurplus: 300,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('FINANCIAL SUMMARY');
            expect(result).not.toContain('Paycheck Variance:');
        });
    });

    describe('Recommendations Section', () => {
        it('should recommend maintaining approach for strong position (>$500)', () => {
            const data = {
                ...createBasicReportData(),
                netImpact: 1000,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('RECOMMENDATIONS');
            expect(result).toContain('Strong Position:');
            expect(result).toContain('Maintain current approach');
            expect(result).toContain('Consider allocating surplus to savings');
        });

        it('should warn about spending gap for deficit (<-$200)', () => {
            const data = {
                ...createBasicReportData(),
                netImpact: -500,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Action Needed:');
            expect(result).toContain('Address spending gap');
            expect(result).toContain('Review and reduce unbudgeted expenses');
        });

        it('should recommend balanced approach for moderate position', () => {
            const data = {
                ...createBasicReportData(),
                netImpact: 100,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Balanced Month:');
            expect(result).toContain('Maintain current approach');
            expect(result).toContain('Monitor recurring unbudgeted expenses');
        });

        it('should include bill analysis for high variance (>$100)', () => {
            const data = {
                ...createBasicReportData(),
                billComparison: {
                    ...createBasicReportData().billComparison,
                    variance: 150,
                    bills: [
                        {
                            id: '1',
                            name: 'Electric',
                            predicted: 100,
                            actual: 150,
                            frequency: 'monthly',
                        },
                        {
                            id: '2',
                            name: 'Water',
                            predicted: 50,
                            actual: 60,
                            frequency: 'monthly',
                        },
                    ],
                },
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Bill Analysis:');
            expect(result).toContain('bill(s) exceeded predictions');
        });

        it('should include budget alert for over budget', () => {
            const data = {
                ...createBasicReportData(),
                budgetSurplus: -500,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Budget Alert:');
            expect(result).toContain('Over budget by');
            expect(result).toContain('$500.00');
        });
    });

    describe('Bill Details with Frequency', () => {
        it('should include bill details with frequency badges in verbose mode', () => {
            const data = {
                ...createBasicReportData(),
                billComparison: {
                    ...createBasicReportData().billComparison,
                    bills: [
                        {
                            id: '1',
                            name: 'Rent',
                            predicted: 1000,
                            actual: 1000,
                            frequency: 'monthly',
                        },
                        {
                            id: '2',
                            name: 'Insurance',
                            predicted: 50,
                            actual: 0,
                            frequency: 'yearly',
                        },
                        {
                            id: '3',
                            name: 'Utilities',
                            predicted: 150,
                            actual: 140,
                            frequency: 'quarterly',
                        },
                    ],
                },
            };
            const result = service.formatAnalysisReport(data, true);

            expect(result).toContain('Bill Details:');
            expect(result).toContain('Rent');
            expect(result).toContain('[Monthly]');
            expect(result).toContain('Insurance');
            expect(result).toContain('[Yearly]');
            expect(result).toContain('Utilities');
            expect(result).toContain('[Quarterly]');
        });

        it('should not include bill details in non-verbose mode', () => {
            const data = {
                ...createBasicReportData(),
                billComparison: {
                    ...createBasicReportData().billComparison,
                    bills: [
                        {
                            id: '1',
                            name: 'Rent',
                            predicted: 1000,
                            actual: 1000,
                            frequency: 'monthly',
                        },
                    ],
                },
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).not.toContain('Bill Details:');
            expect(result).not.toContain('[Monthly]');
            expect(result).toContain('Bills Performance');
        });

        it('should capitalize frequency badge correctly', () => {
            const data = {
                ...createBasicReportData(),
                billComparison: {
                    ...createBasicReportData().billComparison,
                    bills: [
                        {
                            id: '1',
                            name: 'Weekly Bill',
                            predicted: 25,
                            actual: 25,
                            frequency: 'weekly',
                        },
                        {
                            id: '2',
                            name: 'Half-year Bill',
                            predicted: 100,
                            actual: 100,
                            frequency: 'half-year',
                        },
                    ],
                },
            };
            const result = service.formatAnalysisReport(data, true);

            expect(result).toContain('[Weekly]');
            expect(result).toContain('[Half-year]');
        });
    });

    describe('Edge Cases', () => {
        it('should handle zero values gracefully', () => {
            const data = createBasicReportData();
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('$0.00');
            expect(result).toBeTruthy();
        });

        it('should handle very large amounts', () => {
            const data = {
                ...createBasicReportData(),
                additionalIncomeTotal: 999999,
                budgetAllocated: 999999,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('$999999.00');
        });

        it('should handle negative net impact', () => {
            const data = {
                ...createBasicReportData(),
                netImpact: -1000,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Net Impact');
            expect(result).toBeTruthy();
        });
    });
});
