/**
 * Business logic constants and thresholds used throughout the application
 * These values control budget status determination, insights generation, and variance reporting
 */

export const BUSINESS_CONSTANTS = {
    /**
     * Budget spending thresholds (percentage of budget used)
     * - ON_TRACK_THRESHOLD: Budget is considered "on-track" if spending is at or above this percentage
     *   Used for determining budget status (over, on-track, or under)
     * - WELL_UNDER_THRESHOLD: Spending below this percentage indicates budget is performing well
     *   Used for generating positive insights about underspent categories
     */
    BUDGET: {
        ON_TRACK_THRESHOLD: 85,
        WELL_UNDER_THRESHOLD: 70,
    },

    /**
     * Transaction count thresholds
     * - HIGH_FREQUENCY_COUNT: Number of transactions that indicates high spending frequency
     *   Used for generating insights about unusual transaction patterns
     */
    TRANSACTIONS: {
        HIGH_FREQUENCY_COUNT: 30,
    },

    /**
     * Bill and budget variance thresholds (percentage over predicted/budgeted amount)
     * - CRITICAL_VARIANCE_PERCENT: Variance level that indicates critical overspending (status emoji: 🔴)
     * - WARNING_VARIANCE_PERCENT: Variance level that indicates warning state (status emoji: 🟡)
     * Used for determining variance status in bill comparison and emoji indicators
     */
    VARIANCE: {
        CRITICAL_VARIANCE_PERCENT: 20,
        WARNING_VARIANCE_PERCENT: 10,
    },
} as const;
