import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { ITransactionClassificationService } from '../core/transaction-classification.service.interface.js';
import { AnalyzeReportDto } from '../../types/dto/analyze-report.dto.js';
import { BillDetailDto, isBillUpcoming } from '../../types/dto/bill-comparison.dto.js';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';

/**
 * Service for formatting and displaying comprehensive budget analysis information
 */
export class AnalyzeDisplayService {
    constructor(private transactionClassificationService: ITransactionClassificationService) {}

    /**
     * Formats the complete analysis report with all sections
     */
    formatAnalysisReport(data: AnalyzeReportDto, verbose: boolean = false): string {
        const sections = [
            DisplayFormatterUtils.createBoxHeader(
                `Budget Finalization Report + ${this.formatMonthHeader(data.month, data.year)}`
            ),
            this.formatIncomeSection(data, verbose),
            this.formatExpensesSection(data, verbose),
            this.formatPaycheckSection(data),
            this.formatSummarySection(data),
            this.formatRecommendations(data),
        ];

        return sections.join('\n');
    }

    /**
     * Formats the month header
     */
    private formatMonthHeader(month: number, year: number): string {
        return chalk.bold(DisplayFormatterUtils.formatMonthYear(month, year));
    }

    /**
     * Formats the income sources section
     */
    private formatIncomeSection(data: AnalyzeReportDto, verbose: boolean): string {
        const lines = [
            '',
            DisplayFormatterUtils.createSectionHeader('INCOME SOURCES'),
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
        const lines = ['', DisplayFormatterUtils.createSectionHeader('EXPENSES & SPENDING'), ''];

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
            `    Allocated:    ${CurrencyUtils.formatWithSymbol(data.budgetAllocated, data.currencySymbol)}`
        );
        lines.push(
            `    Spent:        ${CurrencyUtils.formatWithSymbol(data.budgetSpent, data.currencySymbol)}`
        );
        lines.push(
            `    Remaining:    ${DisplayFormatterUtils.formatNetImpact(data.budgetSurplus, data.currencySymbol, true)}`
        );

        // Bills performance subsection
        lines.push('');
        lines.push(chalk.bold('  Bills Performance'));
        lines.push(
            `    Predicted:    ${CurrencyUtils.formatWithSymbol(data.billComparison.predictedTotal, data.currencySymbol)}`
        );
        lines.push(
            `    Actual:       ${CurrencyUtils.formatWithSymbol(data.billComparison.actualTotal, data.currencySymbol)}`
        );
        lines.push(
            `    Variance:     ${DisplayFormatterUtils.formatNetImpact(data.billComparison.variance, data.currencySymbol, false)}`
        );

        if (verbose && data.billComparison.bills.length > 0) {
            lines.push('');
            lines.push(chalk.dim('  Bill Details:'));
            data.billComparison.bills.forEach(bill => {
                lines.push(this.formatBillDetail(bill, data.currencySymbol));
            });
        }

        // Disposable income subsection
        //
        // Listed here for visibility, but deliberately NOT styled as a
        // deduction: these purchases are charged to the disposable pool, not to
        // the envelope, so they never reach netImpact. The amount the owner
        // still owes themselves is stated in the summary instead. Pool funding
        // and draws are internal transfers between accounts they already hold,
        // so there is nothing to net off and no breakdown to print.
        if (data.disposableIncomeTransactions.length > 0) {
            // Net of refunds and NOT floored at zero. formatWithSymbol takes an
            // absolute value, so the number alone renders a refund-heavy month
            // identically to a spending one — the caption below carries the
            // direction instead. Deliberately not a negative amount: this
            // section states an action, and formatDisposableAction inverts the
            // instruction rather than printing a negative transfer.
            const isReimbursement = this.disposableBalance(data) >= 0;
            lines.push('');
            lines.push(
                `  ${chalk.bold('Disposable Income'.padEnd(28))} ` +
                    `${CurrencyUtils.formatWithSymbol(data.disposableIncome, data.currencySymbol)}` +
                    transactionCount(data.disposableIncomeTransactions.length)
            );
            lines.push(
                chalk.dim(
                    isReimbursement
                        ? '    reimbursed from the disposable pool — not in the net'
                        : '    refunds exceeded tagged spending — owed back to the pool, not in the net'
                )
            );

            if (verbose) {
                lines.push('');
                lines.push(chalk.dim('  Tagged Transactions:'));
                data.disposableIncomeTransactions.forEach(transaction => {
                    lines.push(this.formatTransactionDetail(transaction, data.currencySymbol));
                });
            }
        }

        return lines.join('\n');
    }

    /**
     * Formats the paycheck analysis section
     */
    private formatPaycheckSection(data: AnalyzeReportDto): string {
        const lines = ['', DisplayFormatterUtils.createSectionHeader('PAYCHECK ANALYSIS'), ''];

        // Use actual values from DTO
        lines.push(
            `  Expected:     ${CurrencyUtils.formatWithSymbol(data.expectedMonthlyPaycheck, data.currencySymbol)}`
        );
        lines.push(
            `  Actual:       ${CurrencyUtils.formatWithSymbol(data.actualPaycheck, data.currencySymbol)}`
        );
        lines.push(
            `  Variance:     ${DisplayFormatterUtils.formatNetImpact(data.paycheckSurplus, data.currencySymbol, true)}`
        );

        return lines.join('\n');
    }

    /**
     * Formats the financial summary section
     */
    private formatSummarySection(data: AnalyzeReportDto): string {
        const lines = [
            '',
            DisplayFormatterUtils.createSectionHeader('FINANCIAL SUMMARY'),
            '',
            chalk.bold('  Total Adjustments:'),
            `    ${DisplayFormatterUtils.getStatusIcon(data.additionalIncomeTotal, true)} ${'Additional Income:'.padEnd(30)} ${DisplayFormatterUtils.formatSignedAmount(data.additionalIncomeTotal, data.currencySymbol, true)}`,
            `    ${DisplayFormatterUtils.getStatusIcon(data.actualPaycheck, true)} ${'Paycheck:'.padEnd(30)} ${DisplayFormatterUtils.formatSignedAmount(data.actualPaycheck, data.currencySymbol, true)}`,
            `    ${DisplayFormatterUtils.getStatusIcon(-data.billComparison.actualTotal, true)} ${'Bills Paid:'.padEnd(30)} ${DisplayFormatterUtils.formatSignedAmount(-data.billComparison.actualTotal, data.currencySymbol, true)}`,
            `    ${DisplayFormatterUtils.getStatusIcon(-data.budgetSpent, true)} ${'Budget Spent:'.padEnd(30)} ${DisplayFormatterUtils.formatSignedAmount(-data.budgetSpent, data.currencySymbol, true)}`,
            `    ${DisplayFormatterUtils.getStatusIcon(-data.unbudgetedExpenseTotal, true)} ${'Unbudgeted Expenses:'.padEnd(30)} ${DisplayFormatterUtils.formatSignedAmount(-data.unbudgetedExpenseTotal, data.currencySymbol, true)}`,
        ];

        // Disposable spending is deliberately absent from this column. It is
        // charged to the pool rather than the envelope, so netImpact does not
        // subtract it — listing it here would stop the column summing to the
        // total. It is stated below the net as an action instead.

        lines.push(`    ${chalk.dim('────────────────────────────────────')}`);

        const netPosition = data.netImpact;

        lines.push(
            `    ${'Net Cash Flow:'.padEnd(30)} ${DisplayFormatterUtils.formatNetImpact(netPosition, data.currencySymbol, true)}`
        );

        lines.push(...this.formatDisposableAction(data));

        return lines.join('\n');
    }

    /**
     * States what the owner still owes themselves out of the disposable pool.
     *
     * This is an action, not an adjustment: the amount is outside netImpact by
     * design, so it is printed below the rule rather than in the column above.
     *
     * `disposableIncome` is a net figure that is NOT floored at zero — a month
     * whose refunds exceed its tagged spending reports a negative balance — so
     * all three signs are handled rather than assuming a positive amount.
     */
    private formatDisposableAction(data: AnalyzeReportDto): string[] {
        const balance = this.disposableBalance(data);
        if (balance === 0) {
            return [];
        }

        const count = data.disposableIncomeTransactions.length;
        const countText = count > 0 ? transactionCount(count) : '';
        const amount = CurrencyUtils.formatWithSymbol(Math.abs(balance), data.currencySymbol);

        if (balance > 0) {
            return [
                '',
                `  ${chalk.cyan('→')} ${chalk.bold('Transfer from disposable pool:'.padEnd(30))} ${chalk.cyan(amount)}${countText}`,
                chalk.dim('    Not included in the net — covers tagged card purchases.'),
            ];
        }

        // Refunds outran spending: the pool is owed money rather than owing it.
        return [
            '',
            `  ${chalk.cyan('←')} ${chalk.bold('Return to disposable pool:'.padEnd(30))} ${chalk.cyan(amount)}${countText}`,
            chalk.dim('    Not included in the net — tagged refunds exceeded tagged spending.'),
        ];
    }

    /**
     * The disposable balance in cents, as the JSON report rounds it, so float
     * noise from refunds that cancel spending never prints a $0.00 transfer
     */
    private disposableBalance(data: AnalyzeReportDto): number {
        return CurrencyUtils.toCents(data.disposableIncome);
    }

    /**
     * Formats actionable recommendations based on the data
     */
    private formatRecommendations(data: AnalyzeReportDto): string {
        const lines = ['', DisplayFormatterUtils.createSectionHeader('RECOMMENDATIONS'), ''];

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
                `    ⚠ Over budget by ${CurrencyUtils.formatWithSymbol(Math.abs(data.budgetSurplus), data.currencySymbol)}`,
                '    • Review spending patterns in budget categories',
                '    • Consider adjusting budget limits for next month'
            );
        }

        return lines.join('\n');
    }

    /**
     * Formats an income item with amount and count
     */
    private formatIncomeItem(label: string, amount: number, symbol: string, count: number): string {
        const formattedAmount = CurrencyUtils.formatWithSymbol(amount, symbol);
        const icon = DisplayFormatterUtils.getStatusIcon(amount, true);

        return `  ${chalk.bold(label.padEnd(28))} ${chalk.green(formattedAmount)} ${icon}${transactionCount(count)}`;
    }

    /**
     * Formats an expense item with amount and count
     */
    private formatExpenseItem(
        label: string,
        amount: number,
        symbol: string,
        count: number
    ): string {
        // formatNetImpact already carries the status icon; appending another
        // renders every expense line as "-$300.00 ⚠ ⚠"
        const formattedAmount = DisplayFormatterUtils.formatNetImpact(-amount, symbol, true);

        return `  ${chalk.bold(label.padEnd(28))} ${formattedAmount}${transactionCount(count)}`;
    }

    /**
     * Formats a transaction detail for verbose mode
     */
    private formatTransactionDetail(transaction: TransactionSplit, symbol: string): string {
        const typeLabel = this.getTransactionTypeLabel(transaction);
        const description = transaction.description || 'No description';
        const amount = CurrencyUtils.formatWithSymbol(parseFloat(transaction.amount), symbol);
        const date = transaction.date ? chalk.dim(transaction.date.split('T')[0]) : '';

        return `    ${typeLabel} ${DisplayFormatterUtils.fitWidth(description, 40)} ${amount} ${date}`;
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
        } else if (this.transactionClassificationService.isWithdrawal(transaction)) {
            return chalk.dim('[WITHDRAWAL]');
        }
        return chalk.dim('[OTHER]');
    }

    /**
     * Formats a bill detail for verbose mode
     */
    private formatBillDetail(bill: BillDetailDto, symbol: string): string {
        const isUpcoming = isBillUpcoming(bill);
        const variance = bill.actual - bill.predicted;
        const varianceColor = variance > 0 ? chalk.red : chalk.green;
        // formatWithSymbol renders the absolute value, so the sign must be explicit
        const sign = variance >= 0 ? '+' : '-';

        // An unpaid bill's "variance" is just its whole amount, which reads as
        // a saving. Say when it is due instead.
        const trailer = isUpcoming
            ? chalk.dim(`(due ${DisplayFormatterUtils.formatShortDate(bill.dueDate!)})`)
            : varianceColor(`(${sign}${CurrencyUtils.formatWithSymbol(variance, symbol)})`);

        // Format frequency with capitalization
        const freq = bill.frequency.charAt(0).toUpperCase() + bill.frequency.slice(1);
        const freqBadge = chalk.dim(`[${freq}]`);

        return `    ${DisplayFormatterUtils.fitWidth(bill.name, 30)} ${DisplayFormatterUtils.padVisible(freqBadge, 15)} Predicted: ${CurrencyUtils.formatWithSymbol(bill.predicted, symbol)} | Actual: ${CurrencyUtils.formatWithSymbol(bill.actual, symbol)} ${trailer}`;
    }
}

/** The dimmed " [N transactions]" suffix after a total */
function transactionCount(count: number): string {
    return chalk.dim(` [${count} transaction${count !== 1 ? 's' : ''}]`);
}
