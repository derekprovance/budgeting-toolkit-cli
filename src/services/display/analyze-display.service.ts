import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { TransactionClassificationService } from '../core/transaction-classification.service.js';
import { AnalyzeReportDto } from '../../types/dto/analyze-report.dto.js';
import { BillDetailDto } from '../../types/dto/bill-comparison.dto.js';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';

/**
 * Service for formatting and displaying comprehensive budget analysis information
 */
export class AnalyzeDisplayService {
    constructor(private transactionClassificationService: TransactionClassificationService) {}

    /**
     * Formats the complete analysis report with all sections
     */
    formatAnalysisReport(data: AnalyzeReportDto, verbose: boolean = false): string {
        const sections = [
            this.formatHeader(
                `Budget Finalization Report + ${this.formatMonthHeader(data.month, data.year)}`
            ),
            this.formatIncomeSection(data, verbose),
            this.formatExpensesSection(data, verbose),
            ...(data.skipPaycheck ? [] : [this.formatPaycheckSection(data)]),
            this.formatSummarySection(data),
            this.formatRecommendations(data),
        ];

        return sections.join('\n');
    }

    /**
     * Formats the header box
     */
    private formatHeader(text: string): string {
        return DisplayFormatterUtils.createBoxHeader(text);
    }

    /**
     * Formats the month header
     */
    private formatMonthHeader(month: number, year: number): string {
        const monthName = Intl.DateTimeFormat('en', { month: 'long' }).format(
            new Date(year, month - 1)
        );
        return `${chalk.bold(monthName + ' ' + year)}`;
    }

    /**
     * Formats the income sources section
     */
    private formatIncomeSection(data: AnalyzeReportDto, verbose: boolean): string {
        const lines = [
            '',
            this.formatSectionHeader('INCOME SOURCES'),
            '',
            this.formatIncomeItem(
                'Additional Income',
                data.additionalIncomeTotal,
                data.currencySymbol,
                data.additionalIncome.length
            ),
        ];

        if (verbose && data.additionalIncome.length > 0) {
            lines.push('');
            data.additionalIncome.forEach(transaction => {
                lines.push(this.formatTransactionDetail(transaction, data.currencySymbol));
            });
        }

        return lines.join('\n');
    }

    /**
     * Formats the expenses and spending section
     */
    private formatExpensesSection(data: AnalyzeReportDto, verbose: boolean): string {
        const lines = ['', this.formatSectionHeader('EXPENSES & SPENDING'), ''];

        // Unbudgeted Expenses section
        lines.push(
            this.formatExpenseItem(
                'Unbudgeted Expenses',
                data.unbudgetedExpenseTotal,
                data.currencySymbol,
                data.unbudgetedExpenses.length
            )
        );

        if (verbose && data.unbudgetedExpenses.length > 0) {
            lines.push('');
            data.unbudgetedExpenses.forEach(transaction => {
                lines.push(this.formatTransactionDetail(transaction, data.currencySymbol));
            });
        }

        // Budget allocation subsection
        lines.push('');
        lines.push(chalk.bold('  Budget Allocation'));

        // Use actual values from DTO
        lines.push(
            `    Allocated:    ${this.formatCurrency(data.budgetAllocated, data.currencySymbol)}`
        );
        lines.push(
            `    Spent:        ${this.formatCurrency(data.budgetSpent, data.currencySymbol)}`
        );
        lines.push(
            `    Remaining:    ${this.formatNetImpact(data.budgetSurplus, data.currencySymbol, true)}`
        );

        // Bills performance subsection
        lines.push('');
        lines.push(chalk.bold('  Bills Performance'));
        lines.push(
            `    Predicted:    ${this.formatCurrency(data.billComparison.predictedTotal, data.currencySymbol)}`
        );
        lines.push(
            `    Actual:       ${this.formatCurrency(data.billComparison.actualTotal, data.currencySymbol)}`
        );
        lines.push(
            `    Variance:     ${this.formatNetImpact(-data.billComparison.variance, data.currencySymbol, true)}`
        );

        if (verbose && data.billComparison.bills.length > 0) {
            lines.push('');
            lines.push(chalk.dim('  Bill Details:'));
            data.billComparison.bills.forEach(bill => {
                lines.push(this.formatBillDetail(bill, data.currencySymbol));
            });
        }

        // Disposable income subsection
        if (data.disposableIncomeTransactions.length > 0) {
            lines.push('');

            // Calculate tagged total for breakdown
            const taggedTotal = this.calculateTransactionTotal(
                data.disposableIncomeTransactions,
                true
            );

            // Show breakdown format when transfers exist
            if (data.disposableIncomeTransfers.length > 0) {
                lines.push(chalk.bold('  Disposable Income'));
                lines.push(
                    `    Tagged:       ${this.formatCurrency(taggedTotal, data.currencySymbol)}`
                );

                // Calculate transfer total
                const transferTotal = this.calculateTransactionTotal(
                    data.disposableIncomeTransfers,
                    false
                );

                lines.push(
                    `    Transfers:    ${this.formatNetImpact(-transferTotal, data.currencySymbol, true)}`
                );
                lines.push(`    ${chalk.dim('────────────────────────')}`);
                lines.push(
                    `    Net:          ${this.formatNetImpact(-data.disposableIncome, data.currencySymbol, true)}`
                );
            } else {
                // Original single-line format when no transfers
                lines.push(
                    this.formatExpenseItem(
                        'Disposable Income',
                        data.disposableIncome,
                        data.currencySymbol,
                        data.disposableIncomeTransactions.length
                    )
                );
            }

            // Verbose mode: transaction details (unchanged)
            if (verbose) {
                lines.push('');
                lines.push(chalk.dim('  Tagged Transactions:'));
                data.disposableIncomeTransactions.forEach(transaction => {
                    lines.push(this.formatTransactionDetail(transaction, data.currencySymbol));
                });

                if (data.disposableIncomeTransfers.length > 0) {
                    lines.push('');
                    lines.push(chalk.dim('  Transfers (Reducing Balance):'));
                    data.disposableIncomeTransfers.forEach(transaction => {
                        lines.push(this.formatTransactionDetail(transaction, data.currencySymbol));
                    });
                }
            }
        }

        return lines.join('\n');
    }

    /**
     * Formats the paycheck analysis section
     */
    private formatPaycheckSection(data: AnalyzeReportDto): string {
        const lines = ['', this.formatSectionHeader('PAYCHECK ANALYSIS'), ''];

        // Use actual values from DTO
        lines.push(
            `  Expected:     ${this.formatCurrency(data.expectedMonthlyPaycheck, data.currencySymbol)}`
        );
        lines.push(
            `  Actual:       ${this.formatCurrency(data.actualPaycheck, data.currencySymbol)}`
        );
        lines.push(
            `  Variance:     ${this.formatNetImpact(data.paycheckSurplus, data.currencySymbol, true)}`
        );

        return lines.join('\n');
    }

    /**
     * Formats the financial summary section
     */
    private formatSummarySection(data: AnalyzeReportDto): string {
        const lines = [
            '',
            this.formatSectionHeader('FINANCIAL SUMMARY'),
            '',
            chalk.bold(
                `  Net Impact                  ${this.formatCurrency(data.netImpact, data.currencySymbol)} ${this.getStatusIcon(data.netImpact, true)}`
            ),
            '',
            chalk.bold('  Total Adjustments:'),
            `    ${this.getStatusIcon(data.additionalIncomeTotal, true)} ${'Additional Income:'.padEnd(30)} ${this.formatNetImpact(data.additionalIncomeTotal, data.currencySymbol, true)}`,
        ];

        // Conditionally add Paycheck Variance
        if (!data.skipPaycheck) {
            lines.push(
                `    ${this.getStatusIcon(data.paycheckSurplus, true)} ${'Paycheck Variance:'.padEnd(30)} ${this.formatNetImpact(data.paycheckSurplus, data.currencySymbol, true)}`
            );
        }

        lines.push(
            `    ${this.getStatusIcon(data.budgetSurplus, true)} ${'Budget Surplus:'.padEnd(30)} ${this.formatNetImpact(data.budgetSurplus, data.currencySymbol, true)}`,
            `    ${this.getStatusIcon(-data.billComparison.variance, true)} ${'Bill Variance:'.padEnd(30)} ${this.formatNetImpact(-data.billComparison.variance, data.currencySymbol, true)}`,
            `    ${this.getStatusIcon(-data.unbudgetedExpenseTotal, true)} ${'Unbudgeted Expenses:'.padEnd(30)} ${this.formatNetImpact(-data.unbudgetedExpenseTotal, data.currencySymbol, true)}`
        );

        if (data.disposableIncomeTransactions.length > 0) {
            lines.push(
                `    ${this.getStatusIcon(-data.disposableIncome, false)} ${'Disposable Spending:'.padEnd(30)} ${this.formatNetImpact(-data.disposableIncome, data.currencySymbol, false)}`
            );
        }

        lines.push(`    ${chalk.dim('────────────────────────────────────')}`);

        const netPosition = data.netImpact;

        lines.push(
            `    ${'Net Position:'.padEnd(32)} ${this.formatCurrency(netPosition, data.currencySymbol)} ${this.getStatusIcon(netPosition, true)}`
        );

        return lines.join('\n');
    }

    /**
     * Formats actionable recommendations based on the data
     */
    private formatRecommendations(data: AnalyzeReportDto): string {
        const lines = ['', this.formatSectionHeader('RECOMMENDATIONS'), ''];

        // Main recommendation based on net impact
        if (data.netImpact > 500) {
            lines.push(
                chalk.green('  ✓ Strong Position:') + chalk.white(' Maintain current approach'),
                '    • Consider allocating surplus to savings or investments',
                '    • Review budget categories for optimization opportunities'
            );
        } else if (data.netImpact < -200) {
            lines.push(
                chalk.red('  ⚠ Action Needed:') + chalk.white(' Address spending gap'),
                '    • Review and reduce unbudgeted expenses',
                '    • Adjust monthly budget categories',
                '    • Identify recurring expenses to budget for'
            );
        } else {
            lines.push(
                chalk.blueBright('  ✓ Balanced Month:') + chalk.white(' Maintain current approach'),
                '    • Monitor recurring unbudgeted expenses',
                '    • Consider adding buffer to monthly budget'
            );
        }

        // Bill analysis recommendations
        if (data.billComparison.variance > 100) {
            const overBudgetBills = data.billComparison.bills.filter(
                b => b.actual > b.predicted
            ).length;
            if (overBudgetBills > 0) {
                lines.push(
                    '',
                    chalk.yellow('  Bill Analysis:'),
                    `    ⚠ ${overBudgetBills} bill(s) exceeded predictions`,
                    '    • Review variable bills for cost control opportunities'
                );
            }
        }

        // Budget surplus recommendations
        if (data.budgetSurplus < 0) {
            lines.push(
                '',
                chalk.yellow('  Budget Alert:'),
                `    ⚠ Over budget by ${this.formatCurrency(Math.abs(data.budgetSurplus), data.currencySymbol)}`,
                '    • Review spending patterns in budget categories',
                '    • Consider adjusting budget limits for next month'
            );
        }

        return lines.join('\n');
    }

    /**
     * Formats a section header with box drawing characters
     */
    private formatSectionHeader(title: string): string {
        return DisplayFormatterUtils.createSectionHeader(title);
    }

    /**
     * Formats an income item with amount and count
     */
    private formatIncomeItem(
        label: string,
        amount: number,
        symbol: string,
        count?: number
    ): string {
        const formattedAmount = this.formatCurrency(amount, symbol);
        const countText =
            count !== undefined
                ? chalk.dim(` [${count} transaction${count !== 1 ? 's' : ''}]`)
                : '';
        const icon = this.getStatusIcon(amount, true);

        return `  ${chalk.bold(label.padEnd(28))} ${chalk.green(formattedAmount)} ${icon}${countText}`;
    }

    /**
     * Formats an expense item with amount and count
     */
    private formatExpenseItem(
        label: string,
        amount: number,
        symbol: string,
        count?: number
    ): string {
        const formattedAmount = this.formatNetImpact(-amount, symbol, true);
        const countText =
            count !== undefined
                ? chalk.dim(` [${count} transaction${count !== 1 ? 's' : ''}]`)
                : '';
        const icon = this.getStatusIcon(-amount, true);

        return `  ${chalk.bold(label.padEnd(28))} ${formattedAmount} ${icon}${countText}`;
    }

    /**
     * Formats a transaction detail for verbose mode
     */
    private formatTransactionDetail(transaction: TransactionSplit, symbol: string): string {
        const typeLabel = this.getTransactionTypeLabel(transaction);
        const description = transaction.description || 'No description';
        const amount = this.formatCurrency(parseFloat(transaction.amount), symbol);
        const date = transaction.date ? chalk.dim(transaction.date.split('T')[0]) : '';

        return `    ${typeLabel} ${description.substring(0, 40).padEnd(40)} ${amount} ${date}`;
    }

    /**
     * Gets transaction type label for display
     */
    private getTransactionTypeLabel(transaction: TransactionSplit): string {
        if (this.transactionClassificationService.isBill(transaction)) {
            return chalk.dim('[BILL]');
        } else if (this.transactionClassificationService.isTransfer(transaction)) {
            return chalk.dim('[TRANSFER]');
        } else if (this.transactionClassificationService.isDeposit(transaction)) {
            return chalk.dim('[DEPOSIT]');
        }
        return chalk.dim('[OTHER]');
    }

    /**
     * Formats a bill detail for verbose mode
     */
    private formatBillDetail(bill: BillDetailDto, symbol: string): string {
        const variance = bill.actual - bill.predicted;
        const varianceColor = variance > 0 ? chalk.red : chalk.green;
        const formattedVariance = varianceColor(
            `(${variance > 0 ? '+' : ''}${this.formatCurrency(variance, symbol)})`
        );

        // Format frequency with capitalization
        const freq = bill.frequency.charAt(0).toUpperCase() + bill.frequency.slice(1);
        const freqBadge = chalk.dim(`[${freq}]`);

        return `    ${bill.name.substring(0, 30).padEnd(30)} ${freqBadge.padEnd(15)} Predicted: ${this.formatCurrency(bill.predicted, symbol)} | Actual: ${this.formatCurrency(bill.actual, symbol)} ${formattedVariance}`;
    }

    /**
     * Calculates total amount from array of transactions
     * @param transactions Transaction array
     * @param useAbsolute Whether to use absolute values (true for expenses)
     * @returns Total amount
     */
    private calculateTransactionTotal(
        transactions: TransactionSplit[],
        useAbsolute: boolean = true
    ): number {
        return transactions.reduce((sum, t) => {
            const amount = parseFloat(t.amount);
            const value = isNaN(amount) ? 0 : amount;
            return sum + (useAbsolute ? Math.abs(value) : value);
        }, 0);
    }

    /**
     * Formats currency with symbol
     */
    private formatCurrency(amount: number, symbol: string): string {
        return DisplayFormatterUtils.formatCurrency(amount, symbol);
    }

    /**
     * Formats a financial value with accounting-style display
     */
    private formatNetImpact(
        amount: number,
        symbol: string,
        positiveIsGood: boolean = true
    ): string {
        return DisplayFormatterUtils.formatNetImpact(amount, symbol, positiveIsGood);
    }

    /**
     * Gets appropriate status icon based on amount
     */
    private getStatusIcon(amount: number, positiveIsGood: boolean): string {
        return DisplayFormatterUtils.getStatusIcon(amount, positiveIsGood);
    }
}
