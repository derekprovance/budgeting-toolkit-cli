import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { ITransactionClassificationService } from '../core/transaction-classification.service.interface.js';
import { AnalyzeReportDto } from '../../types/dto/analyze-report.dto.js';
import { BillDetailDto, isBillUpcoming } from '../../types/dto/bill-comparison.dto.js';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';

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
            this.formatHeader(
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
     * Formats the header box
     */
    private formatHeader(text: string): string {
        return DisplayFormatterUtils.createBoxHeader(text);
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
            `    Variance:     ${this.formatNetImpact(data.billComparison.variance, data.currencySymbol, false)}`
        );

        if (verbose && data.billComparison.bills.length > 0) {
            lines.push('');
            lines.push(chalk.dim('  Bill Details:'));
            data.billComparison.bills.forEach(bill => {
                lines.push(this.formatBillDetail(bill, data.currencySymbol));
            });
        }

        lines.push(...this.formatBudgetRollupWarning(data));

        // Disposable income subsection
        //
        // Listed here for visibility, but deliberately NOT styled as a
        // deduction: these purchases are charged to the disposable pool, not to
        // the envelope, so they never reach netImpact. The amount the owner
        // still owes themselves is stated in the summary instead. Pool funding
        // and draws are internal transfers between accounts they already hold,
        // so there is nothing to net off and no breakdown to print.
        if (data.disposableIncomeTransactions.length > 0) {
            const count = data.disposableIncomeTransactions.length;
            // Net of refunds and NOT floored at zero. formatCurrency takes an
            // absolute value, so the number alone renders a refund-heavy month
            // identically to a spending one — the caption below carries the
            // direction instead. Deliberately not a negative amount: this
            // section states an action, and formatDisposableAction inverts the
            // instruction rather than printing a negative transfer.
            const isReimbursement = data.disposableIncome >= 0;
            lines.push('');
            lines.push(
                `  ${chalk.bold('Disposable Income'.padEnd(28))} ` +
                    `${this.formatCurrency(data.disposableIncome, data.currencySymbol)}` +
                    `${chalk.dim(` [${count} transaction${count !== 1 ? 's' : ''}]`)}`
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
     * Warns when the budget rollup contains spending charged elsewhere.
     *
     * Firefly's budget total is a server-side rollup, so a bill or disposable
     * transaction that also carries a budget cannot be filtered out of it. A
     * bill is then subtracted twice; a disposable transaction is subtracted
     * once when it should not be subtracted at all, being charged to the pool
     * rather than the envelope. Either way the net is corrected arithmetically;
     * this names the transactions so the data can be cleaned up in Firefly.
     */
    private formatBudgetRollupWarning(data: AnalyzeReportDto): string[] {
        const transactions = data.budgetRollupTransactions ?? [];
        // Gate on the transactions, never on the adjustment. The bill half of
        // the correction is capped by what that bucket actually subtracted, so
        // a genuinely double-claimed transaction can carry a $0 adjustment —
        // and that is precisely the case most worth telling the user to fix.
        if (transactions.length === 0) {
            return [];
        }

        const count = transactions.length;
        const noun = count === 1 ? 'transaction is' : 'transactions are';
        const adjustment = this.formatCurrency(
            data.budgetRollupCorrection ?? 0,
            data.currencySymbol
        );
        const lines = [
            '',
            chalk.yellow(`  ⚠ ${count} budgeted ${noun} charged to another section`),
            chalk.dim(`    net adjustment applied: ${adjustment}`),
        ];

        transactions.forEach(transaction => {
            const amount = this.formatCurrency(
                TransactionCalculationUtils.parseAmountSafe(transaction.amount),
                data.currencySymbol
            );
            // The overlap is always with the budget total; say which other
            // section also claims it so it can be corrected in Firefly
            const other = this.transactionClassificationService.isBill(transaction)
                ? 'bill'
                : 'disposable income';
            lines.push(
                chalk.dim(
                    `    ${transaction.description ?? 'Unknown'} ${amount} — ${other} + budget`
                )
            );
        });

        return lines;
    }

    /**
     * Formats the financial summary section
     */
    private formatSummarySection(data: AnalyzeReportDto): string {
        const lines = [
            '',
            this.formatSectionHeader('FINANCIAL SUMMARY'),
            '',
            chalk.bold('  Total Adjustments:'),
            `    ${this.getStatusIcon(data.additionalIncomeTotal, true)} ${'Additional Income:'.padEnd(30)} ${this.formatSignedAmount(data.additionalIncomeTotal, data.currencySymbol, true)}`,
            `    ${this.getStatusIcon(data.actualPaycheck, true)} ${'Paycheck:'.padEnd(30)} ${this.formatSignedAmount(data.actualPaycheck, data.currencySymbol, true)}`,
            `    ${this.getStatusIcon(-data.billComparison.actualTotal, true)} ${'Bills Paid:'.padEnd(30)} ${this.formatSignedAmount(-data.billComparison.actualTotal, data.currencySymbol, true)}`,
            `    ${this.getStatusIcon(-data.budgetSpent, true)} ${'Budget Spent:'.padEnd(30)} ${this.formatSignedAmount(-data.budgetSpent, data.currencySymbol, true)}`,
            `    ${this.getStatusIcon(-data.unbudgetedExpenseTotal, true)} ${'Unbudgeted Expenses:'.padEnd(30)} ${this.formatSignedAmount(-data.unbudgetedExpenseTotal, data.currencySymbol, true)}`,
        ];

        // Disposable spending is deliberately absent from this column. It is
        // charged to the pool rather than the envelope, so netImpact does not
        // subtract it — listing it here would stop the column summing to the
        // total. It is stated below the net as an action instead.

        if (data.budgetRollupCorrection && data.budgetRollupCorrection > 0) {
            lines.push(
                `    ${this.getStatusIcon(data.budgetRollupCorrection, true)} ${'Budget Rollup Adj:'.padEnd(30)} ${this.formatSignedAmount(data.budgetRollupCorrection, data.currencySymbol, true)}`
            );
        }

        lines.push(`    ${chalk.dim('────────────────────────────────────')}`);

        const netPosition = data.netImpact;

        lines.push(
            `    ${'Net Cash Flow:'.padEnd(30)} ${this.formatNetImpact(netPosition, data.currencySymbol, true)}`
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
        if (data.disposableIncome === 0) {
            return [];
        }

        const count = data.disposableIncomeTransactions.length;
        const countText =
            count > 0 ? chalk.dim(` [${count} transaction${count !== 1 ? 's' : ''}]`) : '';
        const amount = this.formatCurrency(Math.abs(data.disposableIncome), data.currencySymbol);

        if (data.disposableIncome > 0) {
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
        // formatNetImpact already carries the status icon; appending another
        // renders every expense line as "-$300.00 ⚠ ⚠"
        const formattedAmount = this.formatNetImpact(-amount, symbol, true);
        const countText =
            count !== undefined
                ? chalk.dim(` [${count} transaction${count !== 1 ? 's' : ''}]`)
                : '';

        return `  ${chalk.bold(label.padEnd(28))} ${formattedAmount}${countText}`;
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
        // formatCurrency renders the absolute value, so the sign must be explicit
        const sign = variance >= 0 ? '+' : '-';

        // An unpaid bill's "variance" is just its whole amount, which reads as
        // a saving. Say when it is due instead.
        const trailer = isUpcoming
            ? chalk.dim(`(due ${DisplayFormatterUtils.formatShortDate(bill.dueDate!)})`)
            : varianceColor(`(${sign}${this.formatCurrency(variance, symbol)})`);

        // Format frequency with capitalization
        const freq = bill.frequency.charAt(0).toUpperCase() + bill.frequency.slice(1);
        const freqBadge = chalk.dim(`[${freq}]`);

        return `    ${bill.name.substring(0, 30).padEnd(30)} ${DisplayFormatterUtils.padVisible(freqBadge, 15)} Predicted: ${this.formatCurrency(bill.predicted, symbol)} | Actual: ${this.formatCurrency(bill.actual, symbol)} ${trailer}`;
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

    /** Signed amount without a trailing icon, for rows with an icon column */
    private formatSignedAmount(
        amount: number,
        symbol: string,
        positiveIsGood: boolean = true
    ): string {
        return DisplayFormatterUtils.formatSignedAmount(amount, symbol, positiveIsGood);
    }

    /**
     * Gets appropriate status icon based on amount
     */
    private getStatusIcon(amount: number, positiveIsGood: boolean): string {
        return DisplayFormatterUtils.getStatusIcon(amount, positiveIsGood);
    }
}
