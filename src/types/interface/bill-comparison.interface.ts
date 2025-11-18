/**
 * Represents a single bill's details including predicted and actual costs
 */
export interface BillDetail {
    /** Bill ID from Firefly III */
    id: string;
    /** Bill name */
    name: string;
    /** Predicted/expected amount for this bill (prorated to monthly) */
    predicted: number;
    /** Actual amount paid in the target month (from transactions) */
    actual: number;
    /** Bill frequency (monthly, weekly, etc.) */
    frequency: string;
}

/**
 * Represents the comparison between predicted and actual bill costs
 */
export interface BillComparison {
    /** Average predicted monthly cost based on all active bills for the year */
    predictedMonthlyAverage: number;
    /** Actual bill costs for the specific month */
    actualMonthlyTotal: number;
    /** Variance (actual - predicted) */
    variance: number;
    /** Individual bill details */
    bills: BillDetail[];
    /** Currency code */
    currencyCode: string;
    /** Currency symbol */
    currencySymbol: string;
}
