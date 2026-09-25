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

/**
 * How a report command writes its result. `json` prints only the versioned
 * JSON document (see report-json.types.ts) to stdout; `text` is the default.
 */
export type OutputFormat = 'text' | 'json';

export interface BudgetDateParams {
    month: number;
    year: number;
    verbose?: boolean;
    /** Output format; omitted means `text` */
    format?: OutputFormat;
}
