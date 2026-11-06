import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import chalk from 'chalk';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { ITransactionClassificationService } from '../core/transaction-classification.service.interface.js';
import { AnalyzeReportDto } from '../../types/dto/analyze-report.dto.js';
import {
    BillDetailDto,
    billVariance,
    isBillUpcoming,
} from '../../types/dto/bill-comparison.dto.js';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';
import { DisposablePoolDirection, disposablePoolAction } from './disposable-pool-action.js';

/** A summary line: a bucket's total and how many transactions it holds */
interface SummaryItem {
    readonly label: string;
    readonly amount: number;
    readonly count: number;
}

export class AnalyzeDisplayService {
    constructor(private transactionClassificationService: ITransactionClassificationService) {}

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

    private formatMonthHeader(month: number, year: number): string {
        return chalk.bold(DisplayFormatterUtils.formatMonthYear(month, year));
    }

    private formatIncomeSection(data: AnalyzeReportDto, verbose: boolean): string {
        const lines = [
            '',
            DisplayFormatterUtils.createSectionHeader('INCOME SOURCES'),
            '',
            this.formatIncomeItem(
                {
                    label: 'Additional Income',
                    amount: data.additionalIncomeTotal,
                    count: data.additionalIncome.length,
                },
                data.currencySymbol
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
                {
                    label: 'Unbudgeted Expenses',
                    amount: data.unbudgetedExpenseTotal,
                    count: data.unbudgetedExpenses.length,
                },
                data.currencySymbol
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
     * Not styled as a deduction: these purchases are charged to the disposable
     * pool, not the envelope, so they never reach netImpact (R-DISP-1).
     */
    private formatDisposableIncomeLines(data: AnalyzeReportDto, verbose: boolean): string[] {
        const transactions = data.disposableIncomeTransactions;
        if (transactions.length === 0) {
            return [];
        }
        // Not floored at zero, and formatWithSymbol drops the sign, so the
        // caption below carries the direction
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

    private formatPaycheckSection(data: AnalyzeReportDto): string {
        const lines = ['', DisplayFormatterUtils.createSectionHeader('PAYCHECK ANALYSIS'), ''];

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

        // Disposable spending is absent: netImpact does not subtract it
        // (R-DISP-1), so listing it would stop the column summing to the total

        lines.push(`    ${chalk.dim('────────────────────────────────────')}`);

        const netPosition = data.netImpact;

        lines.push(
            `    ${'Net Cash Flow:'.padEnd(30)} ${DisplayFormatterUtils.formatNetImpact(netPosition, data.currencySymbol, true)}`
        );

        lines.push(...this.formatDisposableAction(data));

        return lines.join('\n');
    }

    /**
     * What the owner still owes themselves out of the disposable pool, printed
     * below the net because it is outside netImpact. `disposableIncome` is not
     * floored at zero, so it can be owed in either direction.
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

    private formatRecommendations(data: AnalyzeReportDto): string {
        const lines = ['', DisplayFormatterUtils.createSectionHeader('RECOMMENDATIONS'), ''];

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

        if (data.billComparison.variance > 100) {
            const overBudgetBills = data.billComparison.bills.filter(
                b => billVariance(b) > 0
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

    private formatIncomeItem({ label, amount, count }: SummaryItem, symbol: string): string {
        const formattedAmount = CurrencyUtils.formatWithSymbol(amount, symbol);
        const icon = DisplayFormatterUtils.getStatusIcon(amount, true);

        return `  ${chalk.bold(label.padEnd(28))} ${chalk.green(formattedAmount)} ${icon}${transactionCount(count)}`;
    }

    private formatExpenseItem({ label, amount, count }: SummaryItem, symbol: string): string {
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

    private formatBillDetail(bill: BillDetailDto, symbol: string): string {
        const isUpcoming = isBillUpcoming(bill);
        const variance = billVariance(bill);

        // An unpaid bill's "variance" is just its whole amount, which reads as
        // a saving. Say when it is due instead.
        const trailer = isUpcoming
            ? chalk.dim(`(due ${DisplayFormatterUtils.formatShortDate(bill.dueDate)})`)
            : `(${DisplayFormatterUtils.formatSignedAmount(variance, symbol, false)})`;

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
