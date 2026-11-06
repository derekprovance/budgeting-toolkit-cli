import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BillComparisonDto } from './bill-comparison.dto.js';
import { BudgetInsight } from './budget-insight.dto.js';
import { BudgetReportDto } from './budget-report.dto.js';
import { TopExpenseDto } from './top-expense.dto.js';

/**
 * Everything BudgetReportCommand computed for one month: what the text
 * report and the JSON document are both built from.
 */
export interface BudgetReportResult {
    budgets: BudgetReportDto[];
    topExpenses: TopExpenseDto[];
    billComparison: BillComparisonDto;
    /** The month's unbudgeted bucket, as CashFlowService sorted it */
    unbudgeted: TransactionSplit[];
    insights: BudgetInsight[];
    month: number;
    year: number;
    /** Set only when the report is for the current month */
    daysInfo?: {
        daysLeft: number;
        /** Date of the most recent imported transaction, if known */
        dataThrough?: Date;
    };
}
