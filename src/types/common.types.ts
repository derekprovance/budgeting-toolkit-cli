/** `json` prints only the versioned JSON document (report-json.types.ts) to stdout. */
export type OutputFormat = 'text' | 'json';

export interface BudgetDateParams {
    month: number;
    year: number;
    verbose?: boolean;
    /** Omitted means `text` */
    format?: OutputFormat;
}
