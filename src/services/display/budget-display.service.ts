import chalk from 'chalk';
import { BudgetReportDto } from '../../types/dto/budget-report.dto.js';
import { TopExpenseDto } from '../../types/dto/top-expense.dto.js';
import { BudgetInsight } from '../../types/dto/budget-insight.dto.js';
import {
    BillComparisonDto,
    BillDetailDto,
    billVariance,
    getTopBills,
    getRemainingBills,
    isBillUpcoming,
} from '../../types/dto/bill-comparison.dto.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BudgetReportResult } from '../../types/dto/budget-report-result.dto.js';
import { DisplayFormatterUtils } from '../../utils/display-formatter.utils.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { EmojiUtils } from '../../utils/emoji.utils.js';
import { budgetTotals } from './budget-totals.utils.js';

/** The budget rows one section lists, most used first */
interface BudgetSection {
    readonly budgets: BudgetReportDto[];
    readonly currencySymbol: string;
    /** Listed below the rows; empty unless verbose */
    readonly statistics: string[];
}

/** The bills listed one per row, and those summed into one "Others" row */
interface BillRows {
    readonly shown: BillDetailDto[];
    readonly others: BillDetailDto[];
}

export class BudgetDisplayService {
    private static readonly PROGRESS_BAR_WIDTH = 20;
    private static readonly NAME_COLUMN_WIDTH = 25;
    private static readonly AMOUNT_COLUMN_WIDTH = 12;
    private static readonly SECTION_WIDTH = 79;
    private static readonly DESCRIPTION_MAX_LENGTH = 60;

    constructor(private readonly baseUrl: string = '') {}

    formatReport(data: BudgetReportResult, verbose: boolean): string {
        const sections: string[] = [];

        sections.push(this.formatOverviewSection(data));

        const currencySymbol = data.billComparison.currencySymbol;
        const byUsage = [...data.budgets].sort((a, b) => b.percentageUsed - a.percentageUsed);
        const section = (budgets: BudgetReportDto[]): BudgetSection => ({
            budgets,
            currencySymbol,
            statistics: verbose ? this.formatVerboseStatistics(budgets, currencySymbol) : [],
        });

        const overBudgets = byUsage.filter(b => b.status === 'over');
        const onTrackBudgets = byUsage.filter(b => b.status !== 'over');

        if (overBudgets.length > 0) {
            sections.push(this.formatAttentionNeededSection(section(overBudgets)));
        }

        if (onTrackBudgets.length > 0) {
            sections.push(this.formatOnTrackSection(section(onTrackBudgets)));
        }

        if (data.topExpenses.length > 0) {
            sections.push(this.formatTopExpensesSection(data.topExpenses));
        }

        const billRows: BillRows = verbose
            ? { shown: data.billComparison.bills, others: [] }
            : {
                  shown: getTopBills(data.billComparison),
                  others: getRemainingBills(data.billComparison),
              };
        sections.push(this.formatBillsSection(data.billComparison, billRows));

        // The same unbudgeted bucket the analyze net charges
        if (data.unbudgeted.length > 0) {
            sections.push(
                this.formatUnbudgetedSection(data.unbudgeted, data.billComparison.currencySymbol)
            );
        }

        if (data.insights.length > 0) {
            sections.push(this.formatInsightsSection(data.insights));
        }

        sections.push(this.formatFooterTip());

        return sections.join('\n');
    }

    private formatOverviewSection(data: BudgetReportResult): string {
        const {
            spent: totalSpent,
            allocated: totalBudget,
            percentageUsed,
            isOverBudget,
        } = budgetTotals(data.budgets);

        const header = DisplayFormatterUtils.createBoxHeader(
            `BUDGET REPORT - ${DisplayFormatterUtils.formatMonthYear(data.month, data.year).toUpperCase()}`
        );

        const lines: string[] = [header, ''];

        const spentFormatted = CurrencyUtils.formatWithSymbol(
            totalSpent,
            data.billComparison.currencySymbol
        );
        const budgetFormatted = CurrencyUtils.formatWithSymbol(
            totalBudget,
            data.billComparison.currencySymbol
        );
        lines.push(`${chalk.bold('Total Spent:')}      ${spentFormatted} / ${budgetFormatted}`);

        if (isOverBudget) {
            const overAmount = totalSpent - totalBudget;
            const overFormatted = CurrencyUtils.formatWithSymbol(
                overAmount,
                data.billComparison.currencySymbol
            );
            lines.push(
                `${chalk.bold('Status:')}           🔴 OVER BUDGET by ${overFormatted} (${percentageUsed.toFixed(1)}%)`
            );
        } else {
            lines.push(
                `${chalk.bold('Status:')}           ${EmojiUtils.getStatusEmoji(percentageUsed)} ON TRACK (${percentageUsed.toFixed(1)}% spent)`
            );
        }

        if (data.daysInfo) {
            lines.push(`${chalk.bold('Days Remaining:')}   ${data.daysInfo.daysLeft} days`);
            if (data.daysInfo.dataThrough) {
                // A month looks cheap when the last few days have not imported
                lines.push(
                    `${chalk.bold('Data Through:')}     ${DisplayFormatterUtils.formatShortDate(data.daysInfo.dataThrough)}`
                );
            }
            const dailyBudget =
                data.daysInfo.daysLeft > 0
                    ? (totalBudget - totalSpent) / data.daysInfo.daysLeft
                    : 0;
            const symbol = data.billComparison.currencySymbol;
            const dailyFormatted =
                dailyBudget > 0
                    ? CurrencyUtils.formatWithSymbol(dailyBudget, symbol)
                    : chalk.red(`${CurrencyUtils.formatWithSymbol(0, symbol)} (budget exhausted)`);
            lines.push(`${chalk.bold('Daily Budget:')}     ${dailyFormatted}`);
        }

        lines.push('');
        return lines.join('\n');
    }

    private formatAttentionNeededSection(section: BudgetSection): string {
        return this.formatBudgetSectionWithConfig(section, {
            sectionTitle: 'ATTENTION NEEDED',
            statusColor: chalk.red,
            statusEmoji: '🔴',
            formatRemaining: (budget: BudgetReportDto, formatted: string) => `${formatted} over`,
            getRemainingAmount: (budget: BudgetReportDto) => budget.spent - budget.amount,
        });
    }

    private formatOnTrackSection(section: BudgetSection): string {
        return this.formatBudgetSectionWithConfig(section, {
            sectionTitle: 'ON TRACK',
            statusColor: chalk.green,
            statusEmoji: '🟢',
            // A budget with no limit has nothing left or over; its "remaining"
            // is just its spending negated
            formatRemaining: (budget: BudgetReportDto, formatted: string) =>
                budget.amount > 0 ? `${formatted} left` : 'no limit',
            getRemainingAmount: (budget: BudgetReportDto) => budget.remaining,
        });
    }

    private formatBudgetSectionWithConfig(
        { budgets, currencySymbol, statistics }: BudgetSection,
        config: {
            sectionTitle: string;
            statusColor: (str: string) => string;
            statusEmoji: string;
            formatRemaining: (budget: BudgetReportDto, formatted: string) => string;
            getRemainingAmount: (budget: BudgetReportDto) => number;
        }
    ): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader(config.sectionTitle));
        lines.push('');

        budgets.forEach(budget => {
            const spentFormatted = CurrencyUtils.formatWithSymbol(budget.spent, currencySymbol);
            const budgetFormatted = CurrencyUtils.formatWithSymbol(budget.amount, currencySymbol);
            const remaining = config.getRemainingAmount(budget);
            const remainingFormatted = CurrencyUtils.formatWithSymbol(remaining, currencySymbol);

            const progressBar = this.createProgressBar(budget.percentageUsed);
            const remainingText = config.formatRemaining(budget, remainingFormatted);
            const line =
                config.statusColor(config.statusEmoji) +
                ' ' +
                budget.name.padEnd(BudgetDisplayService.NAME_COLUMN_WIDTH) +
                spentFormatted.padStart(BudgetDisplayService.AMOUNT_COLUMN_WIDTH) +
                ' / ' +
                budgetFormatted.padStart(BudgetDisplayService.AMOUNT_COLUMN_WIDTH) +
                '  ' +
                config.statusColor(`${budget.percentageUsed.toFixed(0)}%`.padStart(5)) +
                '  ' +
                config.statusColor(progressBar) +
                '  ' +
                config.statusColor(remainingText);

            lines.push(line);
        });

        lines.push('', ...statistics, '');
        return lines.join('\n');
    }

    private formatTopExpensesSection(expenses: TopExpenseDto[]): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader('TOP EXPENSES'));
        lines.push('');

        expenses.forEach((expense, index) => {
            const amountFormatted = CurrencyUtils.formatWithSymbol(
                expense.amount,
                expense.currencySymbol
            );
            const truncatedDescription = DisplayFormatterUtils.fitWidth(
                expense.description,
                BudgetDisplayService.DESCRIPTION_MAX_LENGTH
            );

            const line =
                chalk.gray(`${index + 1}. `) +
                amountFormatted.padStart(BudgetDisplayService.AMOUNT_COLUMN_WIDTH) +
                '   ' +
                truncatedDescription +
                '  ' +
                chalk.gray(`(${expense.budgetName})`) +
                '  ' +
                chalk.gray(expense.date);

            lines.push(line);
        });

        lines.push('');
        return lines.join('\n');
    }

    /** Each budget's statistics, listed below the section's rows in verbose mode */
    private formatVerboseStatistics(budgets: BudgetReportDto[], currencySymbol: string): string[] {
        return budgets.flatMap(budget => [
            budget.name.toUpperCase(),
            this.formatBudgetStatistics(budget, currencySymbol),
            '',
        ]);
    }

    private formatBudgetStatistics(budget: BudgetReportDto, currencySymbol: string): string {
        const lines: string[] = [];
        const indent = '  ';

        if (budget.transactionStats.topMerchant) {
            const { name, totalSpent, visitCount } = budget.transactionStats.topMerchant;
            const totalFormatted = CurrencyUtils.formatWithSymbol(totalSpent, currencySymbol);
            const visitText = visitCount === 1 ? 'visit' : 'visits';
            lines.push(
                `${indent}📍 Top Merchant: ${name} (${totalFormatted}, ${visitCount} ${visitText})`
            );
        }

        const averageSpentFormatted = CurrencyUtils.formatWithSymbol(
            budget.historicalComparison.averageSpent,
            currencySymbol
        );
        lines.push(`${indent}📊 Avg Spending: ${averageSpentFormatted}`);

        return lines.join('\n');
    }

    private formatBillsSection(
        billComparison: BillComparisonDto,
        { shown: billsToShow, others: otherBills }: BillRows
    ): string {
        const symbol = billComparison.currencySymbol;

        const lines = [
            DisplayFormatterUtils.createSectionHeader('BILLS & RECURRING'),
            '',
            this.formatBillsSummary(billComparison),
            '',
            ...billsToShow.map(bill => this.formatBillRow(bill, symbol)),
        ];
        if (otherBills.length > 0) {
            lines.push(this.formatOtherBillsRow(otherBills, symbol));
        }
        lines.push('');
        return lines.join('\n');
    }

    private formatBillsSummary(billComparison: BillComparisonDto): string {
        const expectedFormatted = CurrencyUtils.formatWithSymbol(
            billComparison.predictedTotal,
            billComparison.currencySymbol
        );
        const actualFormatted = CurrencyUtils.formatWithSymbol(
            billComparison.actualTotal,
            billComparison.currencySymbol
        );

        const varianceEmoji = EmojiUtils.getBillVarianceEmoji(
            billComparison.variance,
            billComparison.predictedTotal
        );
        const varianceDisplay = `${varianceEmoji} ${DisplayFormatterUtils.formatSignedAmount(
            billComparison.variance,
            billComparison.currencySymbol,
            false
        )}`;

        return `Expected: ${expectedFormatted}    Actual: ${actualFormatted}    ${varianceDisplay}${this.formatNotYetDueNote(billComparison)}`;
    }

    /**
     * A favourable variance is only good news once the month's bills have
     * actually come around. Says how much of it is merely unpaid.
     */
    private formatNotYetDueNote(billComparison: BillComparisonDto): string {
        const notYetDue = billComparison.bills.reduce(
            (sum, bill) => sum + (bill.upcomingAmount ?? 0),
            0
        );
        if (notYetDue <= 0) {
            return '';
        }
        return chalk.dim(
            `  (${CurrencyUtils.formatWithSymbol(notYetDue, billComparison.currencySymbol)} not yet due)`
        );
    }

    private formatBillRow(bill: BillDetailDto, symbol: string): string {
        if (!isBillUpcoming(bill)) {
            return this.formatJudgedBillRow(bill, symbol);
        }
        // A bill not yet due is unpaid, not under budget; green would invite
        // the reader to bank money they still owe
        const upcoming = CurrencyUtils.formatWithSymbol(bill.upcomingAmount ?? 0, symbol);
        const predicted = CurrencyUtils.formatWithSymbol(bill.predicted, symbol);
        return this.billRow(
            {
                emoji: EmojiUtils.UPCOMING_BILL_EMOJI,
                name: bill.name,
                actual: bill.actual,
                trailer: chalk.dim(
                    `due ${DisplayFormatterUtils.formatShortDate(bill.dueDate)} (${upcoming} of ${predicted})`
                ),
            },
            symbol
        );
    }

    /** The bills not shown individually, as one row shaped like theirs */
    private formatOtherBillsRow(otherBills: BillDetailDto[], symbol: string): string {
        return this.formatJudgedBillRow(
            {
                name: `Others (${otherBills.length})`,
                actual: otherBills.reduce((sum, bill) => sum + bill.actual, 0),
                predicted: otherBills.reduce((sum, bill) => sum + bill.predicted, 0),
            },
            symbol
        );
    }

    /** A bill row judged on its variance from the expected amount */
    private formatJudgedBillRow(
        bill: Pick<BillDetailDto, 'name' | 'actual' | 'predicted'>,
        symbol: string
    ): string {
        return this.billRow(
            {
                emoji: EmojiUtils.getBillVarianceEmoji(billVariance(bill), bill.predicted),
                name: bill.name,
                actual: bill.actual,
                trailer: `(expected ${CurrencyUtils.formatWithSymbol(bill.predicted, symbol)})`,
            },
            symbol
        );
    }

    private billRow(
        row: { emoji: string; name: string; actual: number; trailer: string },
        symbol: string
    ): string {
        const name = DisplayFormatterUtils.fitWidth(
            row.name,
            BudgetDisplayService.NAME_COLUMN_WIDTH
        );
        const actual = CurrencyUtils.formatWithSymbol(row.actual, symbol).padStart(
            BudgetDisplayService.AMOUNT_COLUMN_WIDTH
        );
        return `${row.emoji} ${name} ${actual}  ${row.trailer}`;
    }

    /** An OSC 8 hyperlink when baseUrl and transactionId are both set */
    private formatDescription(description: string, transactionId: string | undefined): string {
        const truncated = DisplayFormatterUtils.fitWidth(
            description,
            BudgetDisplayService.DESCRIPTION_MAX_LENGTH
        );
        return DisplayFormatterUtils.linkedText(truncated, this.baseUrl, transactionId);
    }

    private formatUnbudgetedSection(
        unbudgeted: TransactionSplit[],
        currencySymbol: string
    ): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader('UNBUDGETED EXPENSES'));
        lines.push('');

        unbudgeted.forEach(transaction => {
            // Signed: a card refund in the bucket reduces the total (R-REFUND-1)
            const amount = TransactionCalculationUtils.calculateNetSpend([transaction]);

            // A refund keeps its minus sign so the rows visibly add up
            const amountFormatted = CurrencyUtils.formatSigned(
                amount,
                transaction.currency_symbol || currencySymbol
            );
            const date = DisplayFormatterUtils.isoDay(transaction.date);

            const transactionId = transaction.transaction_journal_id;
            const formattedDescription = this.formatDescription(
                transaction.description || 'Transaction',
                transactionId
            );

            const line =
                EmojiUtils.getCategoryEmoji(transaction.category_name ?? undefined) +
                ' ' +
                formattedDescription +
                ' ' +
                amountFormatted.padStart(BudgetDisplayService.AMOUNT_COLUMN_WIDTH) +
                '   ' +
                chalk.gray(date);

            lines.push(line);
        });

        lines.push('');
        const total = TransactionCalculationUtils.calculateNetSpend(unbudgeted);
        lines.push(chalk.bold(`Total: ${CurrencyUtils.formatSigned(total, currencySymbol)}`));
        lines.push('');
        return lines.join('\n');
    }

    private formatInsightsSection(insights: BudgetInsight[]): string {
        const lines: string[] = [];
        lines.push(DisplayFormatterUtils.createSectionHeader('INSIGHTS'));
        lines.push('');

        insights.forEach(insight => {
            const { color: iconColor, icon } = BudgetDisplayService.INSIGHT_STYLES[insight.type];
            const line = iconColor(`${icon} ${insight.message}`);
            lines.push(line);
        });

        lines.push('');
        return lines.join('\n');
    }

    private formatFooterTip(): string {
        const lines: string[] = [];
        lines.push(
            DisplayFormatterUtils.createHorizontalLine('─', BudgetDisplayService.SECTION_WIDTH)
        );
        lines.push('');
        lines.push(
            chalk.cyan('💡 TIP: ') + 'Use --verbose or -v to see all bills and budget statistics'
        );
        lines.push('');
        lines.push(
            DisplayFormatterUtils.createHorizontalLine('─', BudgetDisplayService.SECTION_WIDTH)
        );
        lines.push('');

        return lines.join('\n');
    }

    private createProgressBar(percentage: number): string {
        // Clamped both ways: refunds can push a budget below 0%
        const filled = Math.max(
            0,
            Math.min(
                Math.round((percentage / 100) * BudgetDisplayService.PROGRESS_BAR_WIDTH),
                BudgetDisplayService.PROGRESS_BAR_WIDTH
            )
        );
        const empty = BudgetDisplayService.PROGRESS_BAR_WIDTH - filled;

        return `[${'▓'.repeat(filled)}${'░'.repeat(empty)}]`;
    }

    /**
     * Color and icon for each insight type. Keyed by the union so a new
     * insight type is a compile error rather than a silent fallback.
     */
    private static readonly INSIGHT_STYLES: Record<
        BudgetInsight['type'],
        { color: (s: string) => string; icon: string }
    > = {
        warning: { color: chalk.yellow, icon: '⚠' },
        success: { color: chalk.green, icon: '✓' },
        info: { color: chalk.cyan, icon: '•' },
    };
}
