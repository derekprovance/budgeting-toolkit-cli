interface BusinessConstantsShape {
    BUDGET: {
        ON_TRACK_THRESHOLD: number;
        WELL_UNDER_THRESHOLD: number;
    };
    TRANSACTIONS: {
        HIGH_FREQUENCY_COUNT: number;
    };
    VARIANCE: {
        CRITICAL_VARIANCE_PERCENT: number;
        WARNING_VARIANCE_PERCENT: number;
    };
}

export const BUSINESS_CONSTANTS = {
    /** Percent of the budget used: on-track at or above ON_TRACK, well under below WELL_UNDER. */
    BUDGET: {
        ON_TRACK_THRESHOLD: 85,
        WELL_UNDER_THRESHOLD: 70,
    },

    TRANSACTIONS: {
        HIGH_FREQUENCY_COUNT: 30,
    },

    /** Percent over the predicted amount. */
    VARIANCE: {
        CRITICAL_VARIANCE_PERCENT: 20,
        WARNING_VARIANCE_PERCENT: 10,
    },
} as const satisfies BusinessConstantsShape;
