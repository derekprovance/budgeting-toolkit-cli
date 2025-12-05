/**
 * Consolidated enums for the application
 */

export enum EditTransactionAttribute {
    Category = 'Category',
    Budget = 'Budget',
}

export enum CategorizeStatus {
    NO_TAG,
    EMPTY_TAG,
    HAS_RESULTS,
    PROCESSING_FAILED,
}

export enum CategorizeMode {
    Category = 'category',
    Budget = 'budget',
    Both = 'both',
    Skip = 'skip',
    Edit = 'edit',
}
