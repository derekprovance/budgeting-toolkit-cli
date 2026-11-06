import { beforeEach, describe, expect, it } from '@jest/globals';
import { AnalyzeDisplayService } from '../../../src/services/display/analyze-display.service.js';
import { TransactionClassificationService } from '../../../src/services/core/transaction-classification.service.js';
import { AnalyzeReportDto } from '../../../src/types/dto/analyze-report.dto.js';
import stripAnsi from 'strip-ansi';
import { deposit, withdrawal } from '../../shared/test-data.js';

// Output is plain text: FORCE_COLOR=0 (see __tests__/setup/env.ts) disables
// chalk, and stripAnsi removes any remaining escapes such as hyperlinks.

describe('AnalyzeDisplayService', () => {
    let service: AnalyzeDisplayService;

    beforeEach(() => {
        service = new AnalyzeDisplayService(
            new TransactionClassificationService('Disposable Income', 'Paycheck')
        );
    });

    const createBasicReportData = (): AnalyzeReportDto =>
        ({
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
            disposableIncome: 0,
            billComparison: {
                predictedTotal: 1000,
                actualTotal: 950,
                variance: -50,
                bills: [],
                currencyCode: 'USD',
                currencySymbol: '$',
            },
            // netImpact = actualPaycheck + additionalIncomeTotal - billComparison.actualTotal
            //             - budgetSpent - unbudgetedExpenseTotal
            // = 5000 + 0 - 950 - 1500 - 0 = 2550
            // disposableIncome is charged to the pool, not the envelope: no term here.
            netImpact: 2550,
        }) satisfies AnalyzeReportDto;

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

        it('should include transaction details in verbose mode', () => {
            const data = {
                ...createBasicReportData(),
                additionalIncome: [deposit(500, { description: 'Bonus Payment' })],
                additionalIncomeTotal: 500,
                unbudgetedExpenses: [withdrawal(200, { description: 'Emergency Repair' })],
                unbudgetedExpenseTotal: 200,
            };
            const result = service.formatAnalysisReport(data, true);

            expect(result).toContain('Bonus Payment');
            expect(result).toContain('Emergency Repair');
        });

        it('should not include transaction details in non-verbose mode', () => {
            const data = {
                ...createBasicReportData(),
                additionalIncome: [deposit(500, { description: 'Bonus Payment' })],
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
                actualPaycheck: 5200,
                paycheckSurplus: 200,
                budgetSpent: 1500,
                billComparison: {
                    ...createBasicReportData().billComparison,
                    actualTotal: 1050,
                    variance: 50,
                },
                unbudgetedExpenseTotal: 150,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Additional Income:'.padEnd(30));
            expect(result).toContain('Paycheck:'.padEnd(30));
            expect(result).toContain('Bills Paid:'.padEnd(30));
            expect(result).toContain('Budget Spent:'.padEnd(30));
            expect(result).toContain('Unbudgeted Expenses:'.padEnd(30));
        });

        it('should align the disposable transfer action when present', () => {
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [
                    withdrawal(500, { description: 'Disposable expense' }),
                ],
                disposableIncome: 500,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Transfer from disposable pool:'.padEnd(30));
            // it is an action, not one of the itemized adjustments
            expect(result).not.toContain('Disposable Spending:');
        });
    });

    describe('Income Section', () => {
        it('should format income section with transaction count', () => {
            const data = {
                ...createBasicReportData(),
                additionalIncome: [
                    deposit(100, { description: 'Income 1' }),
                    deposit(200, { description: 'Income 2' }),
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
                additionalIncome: [deposit(500, { description: 'Bonus' })],
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
                    withdrawal(100, { description: 'Expense 1' }),
                    withdrawal(150, { description: 'Expense 2' }),
                ],
                unbudgetedExpenseTotal: 250,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Unbudgeted Expenses');
            expect(result).toContain('$250.00');
            expect(result).toContain('[2 transactions]');
            expect(result).not.toContain('Additional Expenses');
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
                    withdrawal(300, { description: 'Disposable expense' }),
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

    describe('status icons', () => {
        it('should render exactly one status icon per expense line', () => {
            // formatNetImpact already carries an icon; a second appended after
            // it produced "-$300.00 ⚠ ⚠" on every expense line.
            const data = {
                ...createBasicReportData(),
                unbudgetedExpenses: [withdrawal(300, { description: 'Spend' })],
                unbudgetedExpenseTotal: 300.0,
            };
            const line = stripAnsi(service.formatAnalysisReport(data, false))
                .split('\n')
                .find(l => l.includes('Unbudgeted Expenses') && l.includes('300.00'));

            expect(line).toBeDefined();
            expect((line!.match(/⚠/g) ?? []).length).toBe(1);
        });

        it('should not judge disposable spending as an expense at all', () => {
            // It is charged to the pool rather than the envelope, so it never
            // reaches netImpact and must not appear among the deductions that
            // do — the itemized column has to keep summing to the total.
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [withdrawal(250, { description: 'Tagged' })],
                disposableIncome: 250.0,
            };
            const lines = stripAnsi(service.formatAnalysisReport(data, false)).split('\n');

            expect(lines.find(l => l.includes('Disposable Spending:'))).toBeUndefined();

            const action = lines.find(l => l.includes('Transfer from disposable pool:'));
            expect(action).toBeDefined();
            expect(action).toContain('250.00');
            // an action, not a deduction: no warning icon, no minus sign
            expect(action).not.toContain('⚠');
            expect(action).not.toContain('-$');
        });

        it('should render one icon per summary line', () => {
            const lines = stripAnsi(
                service.formatAnalysisReport(createBasicReportData(), false)
            ).split('\n');

            const paycheck = lines.find(l => l.includes('Paycheck:') && l.includes('5000'));

            expect(paycheck).toBeDefined();
            expect((paycheck!.match(/✓/g) ?? []).length).toBe(1);
        });
    });

    describe('Disposable Income', () => {
        // Pool funding and draws are movement between accounts the owner
        // already holds, so there is no breakdown to print: the tagged
        // purchases ARE the expense, on one line.
        it('should show disposable spending on a single line', () => {
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [
                    withdrawal(1940.33, { description: 'Tagged expense 1' }),
                    withdrawal(1000, { description: 'Tagged expense 2' }),
                ],
                disposableIncome: 2940.33,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Disposable Income');
            expect(result).toContain('$2940.33');
            expect(result).toContain('[2 transactions]');
        });

        it('should not print a tagged/transfers/net breakdown', () => {
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [
                    withdrawal(440.33, { description: 'Tagged expense' }),
                ],
                disposableIncome: 440.33,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).not.toContain('Tagged:');
            expect(result).not.toContain('Transfers:');
            expect(result).not.toContain('floored at 0');
        });

        it('should omit the section when there is no tagged spending', () => {
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [],
                disposableIncome: 0,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).not.toContain('Disposable Income');
        });

        it('should show a net-negative month rather than clamping it', () => {
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [deposit(250, { description: 'Refund' })],
                disposableIncome: -250,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('250.00');
        });

        it('should list tagged transactions in verbose mode', () => {
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [
                    withdrawal(2940.33, { description: 'Tagged expense' }),
                ],
                disposableIncome: 2940.33,
            };
            const result = service.formatAnalysisReport(data, true);

            expect(result).toContain('Tagged Transactions:');
            expect(result).toContain('Tagged expense');
            expect(result).not.toContain('Transfers (Reducing Balance):');
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
            expect(result).toContain('Total Adjustments:');
            expect(result).toContain('$300.00');
        });

        it('should display net cash flow label in summary section', () => {
            const data = {
                ...createBasicReportData(),
                netImpact: 2550,
            };
            const result = service.formatAnalysisReport(data, false);

            expect(result).toContain('Net Cash Flow:');
            expect(result).toContain('$2550.00');
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
                            upcomingAmount: 0,
                        },
                        {
                            id: '2',
                            name: 'Water',
                            predicted: 50,
                            actual: 60,
                            frequency: 'monthly',
                            upcomingAmount: 0,
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
        it('should print a bill paid exactly as predicted without a sign', () => {
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
                            upcomingAmount: 0,
                        },
                    ],
                },
            };

            const rentLine = stripAnsi(service.formatAnalysisReport(data, true))
                .split('\n')
                .find(line => line.includes('Rent'));

            expect(rentLine).toMatch(/\(\$0\.00\)$/);
        });

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
                            upcomingAmount: 0,
                        },
                        {
                            id: '2',
                            name: 'Insurance',
                            predicted: 50,
                            actual: 0,
                            frequency: 'yearly',
                            upcomingAmount: 0,
                        },
                        {
                            id: '3',
                            name: 'Utilities',
                            predicted: 150,
                            actual: 140,
                            frequency: 'quarterly',
                            upcomingAmount: 0,
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
                            upcomingAmount: 0,
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
                            upcomingAmount: 0,
                        },
                        {
                            id: '2',
                            name: 'Half-year Bill',
                            predicted: 100,
                            actual: 100,
                            frequency: 'half-year',
                            upcomingAmount: 0,
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

            expect(result).toBeTruthy();
            expect(result).toContain('Total Adjustments:');
            expect(result).toContain('$1000.00');
            expect(result).toContain('FINANCIAL SUMMARY');
        });
    });

    describe('disposable transfer action', () => {
        it('should tell the owner to transfer a positive balance out of the pool', () => {
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [
                    withdrawal(400, { description: 'TRAVEL BOOKING' }),
                    withdrawal(589.03, { description: 'Montauk' }),
                ],
                disposableIncome: 250.0,
            };

            const result = stripAnsi(service.formatAnalysisReport(data, false));

            expect(result).toContain('Transfer from disposable pool:');
            expect(result).toContain('250.00');
            expect(result).toContain('[2 transactions]');
            expect(result).toContain('Not included in the net');
        });

        it('should invert the instruction when refunds outran tagged spending', () => {
            // disposableIncome is net of refunds and is NOT floored at zero, so
            // a negative balance is reachable and must never render as a
            // negative transfer instruction.
            const data = {
                ...createBasicReportData(),
                disposableIncomeTransactions: [deposit(250, { description: 'Refund' })],
                disposableIncome: -250,
            };

            const result = stripAnsi(service.formatAnalysisReport(data, false));

            expect(result).toContain('Return to disposable pool:');
            expect(result).toContain('250.00');
            expect(result).not.toContain('-$250.00');
            expect(result).not.toContain('Transfer from disposable pool:');
        });

        it('should stay silent when the balance is zero', () => {
            const data = { ...createBasicReportData(), disposableIncome: 0 };

            const result = stripAnsi(service.formatAnalysisReport(data, false));

            expect(result).not.toContain('disposable pool:');
        });
    });
});
