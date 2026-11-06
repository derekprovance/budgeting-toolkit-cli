import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { ITransactionClassificationService } from '../core/transaction-classification.service.interface.js';
import { AnalyzeReportDto } from '../../types/dto/analyze-report.dto.js';
import { BillDetailDto, isBillUpcoming } from '../../types/dto/bill-comparison.dto.js';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';
import { DisposablePoolDirection, disposablePoolAction } from './disposable-pool-action.js';

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
            lines.push(
                '',
                ...this.formatTransactionDetails(data.additionalIncome, data.currencySymbol)
            );
        }

        return lines.join('\n');
    }

    /**
     * Formats the expenses and spending section
     */
    private formatExpensesSection(data: AnalyzeReportDto, verbose: boolean): string {
        return [
            '',
            DisplayFormatterUtils.createSectionHeader('EXPENSES & SPENDING'),
            '',
            ...this.formatUnbudgetedLines(data, verbose),
            ...this.formatBudgetAllocationLines(data),
            ...this.formatBillsPerformanceLines(data, verbose),
            ...this.formatDisposableIncomeLines(data, verbose),
        ].join('\n');
    }

    private formatUnbudgetedLines(data: AnalyzeReportDto, verbose: boolean): string[] {
        const lines = [
            this.formatExpenseItem(
                'Unbudgeted Expenses',
                data.unbudgetedExpenseTotal,
                data.currencySymbol,
                data.unbudgetedExpenses.length
            ),
        ];
        if (verbose && data.unbudgetedExpenses.length > 0) {
            lines.push(
                '',
                ...this.formatTransactionDetails(data.unbudgetedExpenses, data.currencySymbol)
            );
        }
        return lines;
    }

    private formatBudgetAllocationLines(data: AnalyzeReportDto): string[] {
        const symbol = data.currencySymbol;
        return [
            '',
            chalk.bold('  Budget Allocation'),
            `    Allocated:    ${CurrencyUtils.formatWithSymbol(data.budgetAllocated, symbol)}`,
            `    Spent:        ${CurrencyUtils.formatWithSymbol(data.budgetSpent, symbol)}`,
            `    Remaining:    ${DisplayFormatterUtils.formatNetImpact(data.budgetSurplus, symbol, true)}`,
        ];
    }

    private formatBillsPerformanceLines(data: AnalyzeReportDto, verbose: boolean): string[] {
        const { billComparison, currencySymbol: symbol } = data;
        const lines = [
            '',
            chalk.bold('  Bills Performance'),
            `    Predicted:    ${CurrencyUtils.formatWithSymbol(billComparison.predictedTotal, symbol)}`,
            `    Actual:       ${CurrencyUtils.formatWithSymbol(billComparison.actualTotal, symbol)}`,
            `    Variance:     ${DisplayFormatterUtils.formatNetImpact(billComparison.variance, symbol, false)}`,
        ];
        if (verbose && billComparison.bills.length > 0) {
            lines.push(
                '',
                chalk.dim('  Bill Details:'),
                ...billComparison.bills.map(bill => this.formatBillDetail(bill, symbol))
            );
        }
        return lines;
    }

    /**
     * Listed for visibility, but deliberately NOT styled as a deduction: these
     * purchases are charged to the disposable pool, not to the envelope, so
     * they never reach netImpact (R-DISP-1). The amount the owner still owes
     * themselves is stated in the summary instead.
     */
    private formatDisposableIncomeLines(data: AnalyzeReportDto, verbose: boolean): string[] {
        const transactions = data.disposableIncomeTransactions;
        if (transactions.length === 0) {
            return [];
        }
        // Net of refunds and NOT floored at zero. formatWithSymbol takes an
        // absolute value, so the number alone renders a refund-heavy month
        // identically to a spending one — the caption below carries the
        // direction instead.
        const isReimbursement = disposablePoolAction(data.disposableIncome)?.direction !== 'toPool';
        const lines = [
            '',
            `  ${chalk.bold('Disposable Income'.padEnd(28))} ` +
                `${CurrencyUtils.formatWithSymbol(data.disposableIncome, data.currencySymbol)}` +
                transactionCount(transactions.length),
            chalk.dim(
                isReimbursement
                    ? '    reimbursed from the disposable pool — not in the net'
                    : '    refunds exceeded tagged spending — owed back to the pool, not in the net'
            ),
        ];
        if (verbose) {
            lines.push(
                '',
                chalk.dim('  Tagged Transactions:'),
                ...this.formatTransactionDetails(transactions, data.currencySymbol)
            );
        }
        return lines;
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
        const action = disposablePoolAction(data.disposableIncome);
        if (!action) {
            return [];
        }

        const count = data.disposableIncomeTransactions.length;
        const countText = count > 0 ? transactionCount(count) : '';
        const amount = CurrencyUtils.formatWithSymbol(action.amount, data.currencySymbol);
        const { arrow, label, note } = DISPOSABLE_ACTION_TEXT[action.direction];

        return [
            '',
            `  ${chalk.cyan(arrow)} ${chalk.bold(label.padEnd(30))} ${chalk.cyan(amount)}${countText}`,
            chalk.dim(`    Not included in the net — ${note}.`),
        ];
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

    /** One line per transaction, for verbose mode */
    private formatTransactionDetails(transactions: TransactionSplit[], symbol: string): string[] {
        return transactions.map(transaction => this.formatTransactionDetail(transaction, symbol));
    }

    private formatTransactionDetail(transaction: TransactionSplit, symbol: string): string {
        const typeLabel = this.getTransactionTypeLabel(transaction);
        const description = transaction.description || 'No description';
        const amount = CurrencyUtils.formatWithSymbol(parseFloat(transaction.amount), symbol);
        const date = chalk.dim(DisplayFormatterUtils.isoDay(transaction.date));

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

        // An unpaid bill's "variance" is just its whole amount, which reads as
        // a saving. Say when it is due instead.
        const trailer = isUpcoming
            ? chalk.dim(`(due ${DisplayFormatterUtils.formatShortDate(bill.dueDate!)})`)
            : `(${DisplayFormatterUtils.formatSignedAmount(variance, symbol, false)})`;

        // Format frequency with capitalization
        const freq = bill.frequency.charAt(0).toUpperCase() + bill.frequency.slice(1);
        const freqBadge = chalk.dim(`[${freq}]`);

        return `    ${DisplayFormatterUtils.fitWidth(bill.name, 30)} ${DisplayFormatterUtils.padVisible(freqBadge, 15)} Predicted: ${CurrencyUtils.formatWithSymbol(bill.predicted, symbol)} | Actual: ${CurrencyUtils.formatWithSymbol(bill.actual, symbol)} ${trailer}`;
    }
}

const DISPOSABLE_ACTION_TEXT: Record<
    DisposablePoolDirection,
    { arrow: string; label: string; note: string }
> = {
    fromPool: {
        arrow: '→',
        label: 'Transfer from disposable pool:',
        note: 'covers tagged card purchases',
    },
    // Refunds outran spending: the pool is owed money rather than owing it
    toPool: {
        arrow: '←',
        label: 'Return to disposable pool:',
        note: 'tagged refunds exceeded tagged spending',
    },
};

/** The dimmed " [N transactions]" suffix after a total */
function transactionCount(count: number): string {
    return chalk.dim(` [${count} transaction${count !== 1 ? 's' : ''}]`);
}
