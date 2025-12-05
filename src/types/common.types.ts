/**
 * Consolidated common types and interfaces used across the application
 */

export interface DateRangeDto {
    startDate: Date;
    endDate: Date;
}

export interface ExcludedTransactionDto {
    description: string;
    reason: string;
    amount?: string;
}

export interface ValidTransfer {
    source: string;
    destination: string;
}

export interface BudgetDateParams {
    month: number;
    year: number;
    verbose?: boolean;
    skipPaycheck?: boolean;
}
