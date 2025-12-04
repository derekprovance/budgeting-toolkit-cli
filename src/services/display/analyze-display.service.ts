import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { BaseTransactionDisplayService } from './base-transaction-display.service.js';
import { AnalyzeReportDto } from '../../types/dto/analyze-report.dto.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { BillDetailDto } from '../../types/dto/bill-comparison.dto.js';

/**
 * Service for formatting and displaying comprehensive budget analysis information
 */
export class AnalyzeDisplayService {
    constructor(private baseTransactionDisplayService: BaseTransactionDisplayService) {}

    /**
     * Formats the complete analysis report with all sections
     */
    formatAnalysisReport(data: AnalyzeReportDto, verbose: boolean = false): string {
        const sections = [
            this.formatHeader('Budget Finalization Report'),
            this.formatMonthHeader(data.month, data.year),
            this.formatIncomeSection(data, verbose),
            this.formatExpensesSection(data, verbose),
            this.formatPaycheckSection(data, verbose),
            this.formatSummarySection(data),
            this.formatRecommendations(data),
        ];

        return sections.join('\n');
    }

    /**
     * Formats the header box
     */
    private formatHeader(text: string): string {
        const padding = 2;
        const textLength = text.length;
        const totalLength = textLength + padding * 2;

        const topBorder = '╔' + '═'.repeat(totalLength) + '╗';
        const middleLine = '║' + ' '.repeat(padding) + text + ' '.repeat(padding) + '║';
        const bottomBorder = '╚' + '═'.repeat(totalLength) + '╝';

        return `\n${chalk.cyan(topBorder)}\n${chalk.cyan(middleLine)}\n${chalk.cyan(bottomBorder)}`;
    }

    /**
     * Formats the month header
     */
    private formatMonthHeader(month: number, year: number): string {
        const monthName = Intl.DateTimeFormat('en', { month: 'long' }).format(
            new Date(year, month - 1)
        );
        return `\n${chalk.cyan('📅')} ${chalk.bold(monthName + ' ' + year)}`;
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
            `    Predicted:    ${this.formatCurrency(data.billComparison.predictedMonthlyAverage, data.currencySymbol)}`
        );
        lines.push(
            `    Actual:       ${this.formatCurrency(data.billComparison.actualMonthlyTotal, data.currencySymbol)}`
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
        if (data.disposableIncome > 0) {
            lines.push('');
            lines.push(
                this.formatExpenseItem(
                    'Disposable Income',
                    data.disposableIncome,
                    data.currencySymbol
                )
            );
        }

        return lines.join('\n');
    }

    /**
     * Formats the paycheck analysis section
     */
    private formatPaycheckSection(data: AnalyzeReportDto, verbose: boolean): string {
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
            `    ${this.getStatusIcon(data.additionalIncomeTotal, true)} Additional Income:      ${this.formatNetImpact(data.additionalIncomeTotal, data.currencySymbol, true)}`,
            `    ${this.getStatusIcon(data.paycheckSurplus, true)} Paycheck Variance:      ${this.formatNetImpact(data.paycheckSurplus, data.currencySymbol, true)}`,
            `    ${this.getStatusIcon(data.budgetSurplus, true)} Budget Surplus:         ${this.formatNetImpact(data.budgetSurplus, data.currencySymbol, true)}`,
            `    ${this.getStatusIcon(-data.billComparison.variance, true)} Bill Variance:          ${this.formatNetImpact(-data.billComparison.variance, data.currencySymbol, true)}`,
            `    ${this.getStatusIcon(-data.unbudgetedExpenseTotal, false)} Unbudgeted Expenses:    ${this.formatNetImpact(-data.unbudgetedExpenseTotal, data.currencySymbol, false)}`,
        ];

        if (data.disposableIncome > 0) {
            lines.push(
                `    ${this.getStatusIcon(-data.disposableIncome, false)} Disposable Spending:    ${this.formatNetImpact(-data.disposableIncome, data.currencySymbol, false)}`
            );
        }

        lines.push(`    ${chalk.dim('────────────────────────────────────')}`);

        const netPosition =
            data.additionalIncomeTotal +
            data.paycheckSurplus +
            data.budgetSurplus -
            data.billComparison.variance -
            data.unbudgetedExpenseTotal -
            data.disposableIncome;

        lines.push(
            `    Net Position:           ${this.formatCurrency(netPosition, data.currencySymbol)} ${this.getStatusIcon(netPosition, true)}`
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
                chalk.blue('  ✓ Balanced Month:') + chalk.white(' Maintain current approach'),
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
        const width = 45;
        const topBorder = '┌' + '─'.repeat(width) + '┐';
        const middleLine = '│ ' + chalk.bold(title) + ' '.repeat(width - title.length - 1) + '│';
        const bottomBorder = '└' + '─'.repeat(width) + '┘';

        return `${chalk.cyan(topBorder)}\n${chalk.cyan(middleLine)}\n${chalk.cyan(bottomBorder)}`;
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
        const formattedAmount = this.formatNetImpact(-amount, symbol, false);
        const countText =
            count !== undefined
                ? chalk.dim(` [${count} transaction${count !== 1 ? 's' : ''}]`)
                : '';
        const icon = this.getStatusIcon(-amount, false);

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
        // Access the classification service through baseTransactionDisplayService
        const classificationService = (this.baseTransactionDisplayService as any)
            .transactionClassificationService;

        if (classificationService.isBill(transaction)) {
            return chalk.dim('[BILL]');
        } else if (classificationService.isTransfer(transaction)) {
            return chalk.dim('[TRANSFER]');
        } else if (classificationService.isDeposit(transaction)) {
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

        return `    ${bill.name.substring(0, 30).padEnd(30)} Predicted: ${this.formatCurrency(bill.predicted, symbol)} | Actual: ${this.formatCurrency(bill.actual, symbol)} ${formattedVariance}`;
    }

    /**
     * Formats currency with symbol
     */
    private formatCurrency(amount: number, symbol: string): string {
        return CurrencyUtils.formatWithSymbol(Math.abs(amount), symbol);
    }

    /**
     * Formats a financial value with accounting-style display.
     * Shows sign based on impact to net position.
     *
     * @param amount - The amount to format (can be positive or negative)
     * @param symbol - Currency symbol
     * @param positiveIsGood - Whether positive values are good (default: true)
     * @returns Formatted string with sign, color, and icon
     */
    private formatNetImpact(
        amount: number,
        symbol: string,
        positiveIsGood: boolean = true
    ): string {
        const absFormatted = CurrencyUtils.formatWithSymbol(Math.abs(amount), symbol);

        if (amount === 0) {
            return chalk.white(`${absFormatted} ○`);
        }

        // Determine if this is good or bad based on amount and context
        const isGood = positiveIsGood ? amount > 0 : amount < 0;

        // Format with appropriate sign, color, and icon
        if (isGood) {
            const sign = amount > 0 ? '+' : '-';
            return chalk.green(`${sign}${absFormatted} ✓`);
        } else {
            const sign = amount > 0 ? '+' : '-';
            return chalk.red(`${sign}${absFormatted} ⚠`);
        }
    }


    /**
     * Gets appropriate status icon based on amount
     */
    private getStatusIcon(amount: number, positiveIsGood: boolean): string {
        if (amount === 0) return '○';
        if (positiveIsGood) {
            return amount > 0 ? chalk.green('✓') : chalk.red('⚠');
        } else {
            return amount < 0 ? chalk.green('✓') : chalk.red('⚠');
        }
    }
}
