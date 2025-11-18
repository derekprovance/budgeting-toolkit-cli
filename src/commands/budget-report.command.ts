import { BudgetReportService } from '../services/budget-report.service';
import { TransactionService } from '../services/core/transaction.service';
import { Command } from '../types/interface/command.interface';
import { BudgetDateParams } from '../types/interface/budget-date-params.interface';
import { BudgetDisplayService } from '../services/display/budget-display.service';
import { BillComparisonService } from '../services/bill-comparison.service';

/**
 * Command for displaying budget report
 */
export class BudgetReportCommand implements Command<void, BudgetDateParams> {
    constructor(
        private readonly budgetReportService: BudgetReportService,
        private readonly transactionService: TransactionService,
        private readonly budgetDisplayService: BudgetDisplayService,
        private readonly billComparisonService: BillComparisonService
    ) {}

    /**
     * Executes the budget report command
     * @param params The month and year to display budget report for
     */
    async execute({ month, year }: BudgetDateParams): Promise<void> {
        const budgetReports = await this.budgetReportService.getBudgetReport(month, year);
        const lastUpdatedOn =
            (await this.transactionService.getMostRecentTransactionDate()) || new Date();
        const isCurrentMonth =
            new Date().getMonth() + 1 === month && new Date().getFullYear() === year;

        const { daysLeft, percentageLeft, currentDay, totalDays } = isCurrentMonth
            ? this.getDaysLeftInfo(month, year, lastUpdatedOn)
            : {
                  daysLeft: 0,
                  percentageLeft: 0,
                  currentDay: 0,
                  totalDays: 0,
              };

        const totalBudget = budgetReports.reduce((sum, report) => sum + report.amount, 0);
        const totalSpent = budgetReports.reduce((sum, report) => sum + report.spent, 0);
        const totalPercentage = this.getPercentageSpent(totalSpent, totalBudget);

        const unbudgetedTransactions = await this.budgetReportService.getUntrackedTransactions(
            month,
            year
        );

        // Display header
        console.log(
            this.budgetDisplayService.formatHeader(
                month,
                year,
                isCurrentMonth ? daysLeft : undefined,
                isCurrentMonth ? percentageLeft : undefined,
                isCurrentMonth ? lastUpdatedOn : undefined
            )
        );

        // Display individual budget items
        const nameWidth = Math.max(...budgetReports.map(report => report.name.length), 20);

        budgetReports.forEach(report => {
            console.log(
                this.budgetDisplayService.formatBudgetItem(
                    report,
                    nameWidth,
                    isCurrentMonth,
                    currentDay,
                    totalDays
                )
            );
            console.log();
        });

        // Display summary
        console.log('─'.repeat(nameWidth + 50));
        console.log(
            this.budgetDisplayService.formatSummary(
                totalSpent,
                totalBudget,
                nameWidth,
                isCurrentMonth,
                currentDay,
                totalDays
            )
        );

        // Display list of unbudgeted transactions
        console.log(this.budgetDisplayService.listUnbudgetedTransactions(unbudgetedTransactions));

        // Display bill comparison
        const billComparison = await this.billComparisonService.calculateBillComparison(
            month,
            year
        );
        console.log(this.budgetDisplayService.formatBillComparisonSection(billComparison));

        // Display warning if necessary
        if (isCurrentMonth) {
            let warning =
                this.budgetDisplayService.getSpendRateWarning(totalPercentage, percentageLeft) ??
                '';
            warning +=
                this.budgetDisplayService.getUnbudgetedExpenseWarning(
                    unbudgetedTransactions.length
                ) ?? '';
            if (warning) {
                console.log(warning);
            }
        }
    }

    private getDaysLeftInfo(month: number, year: number, lastUpdatedOn: Date) {
        const lastDay = new Date(year, month, 0).getDate();
        const currentDay = lastUpdatedOn.getDate();
        const daysLeft = lastDay - currentDay;
        const percentageLeft = ((lastDay - currentDay) / lastDay) * 100;

        return {
            daysLeft,
            percentageLeft,
            currentDay,
            totalDays: lastDay,
        };
    }

    private getPercentageSpent(spent: number, amount: number): number {
        const percentage = Math.abs(spent) / amount;
        return percentage ? percentage * 100 : 0;
    }
}
