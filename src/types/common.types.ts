/**
 * Consolidated common types and interfaces used across the application
 */

export interface DateRangeDto {
    startDate: Date;
    endDate: Date;
    /** YYYY-MM-DD built from local date parts — safe to send to the API regardless of timezone */
    startDateString: string;
    endDateString: string;
}

export interface ValidTransfer {
    source: string;
    destination: string;
}

export interface BudgetDateParams {
    month: number;
    year: number;
    verbose?: boolean;
}
