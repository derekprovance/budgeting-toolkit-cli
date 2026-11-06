/**
 * Output of `analyze --json` and `report --json`. A breaking change must bump `schemaVersion`.
 * Money is rounded to cents; transaction amounts are unsigned as Firefly returns them, with
 * direction in `type`.
 */

export interface TransactionJson {
    journalId: string;
    description: string;
    type: string;
    amount: number;
    date: string;
    sourceId: string | null;
    destinationId: string | null;
    budgetId: string | null;
    billId: string | null;
}

export interface AnalyzeReportJson {
    schemaVersion: 2;
    month: number;
    year: number;
    currencyCode: string;
    currencySymbol: string;
    paycheck: { expected: number; actual: number; variance: number };
    additionalIncome: { total: number; transactions: TransactionJson[] };
    unbudgetedExpenses: { total: number; transactions: TransactionJson[] };
    budget: { allocated: number; spent: number; remaining: number };
    bills: {
        predicted: number;
        actual: number;
        variance: number;
        bills: { id: string; name: string; predicted: number; actual: number; frequency: string }[];
    };
    disposable: {
        balance: number;
        transactions: TransactionJson[];
        /** fromPool when balance > 0, toPool when balance < 0, null at 0. */
        action: { direction: 'fromPool' | 'toPool'; amount: number } | null;
    };
    netCashFlow: number;
}

export interface BudgetReportJson {
    schemaVersion: 2;
    month: number;
    year: number;
    currencySymbol: string;
    totals: { spent: number; allocated: number; percentageUsed: number };
    budgets: {
        id: string;
        name: string;
        allocated: number;
        spent: number;
        remaining: number;
        percentageUsed: number;
        status: string;
        previousMonthSpent: number | null;
        averageSpent: number | null;
    }[];
    bills: { predicted: number; actual: number; variance: number };
    unbudgetedExpenses: { total: number; transactions: TransactionJson[] };
}
