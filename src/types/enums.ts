export enum EditTransactionAttribute {
    Category = 'Category',
    Budget = 'Budget',
}

export enum CategorizeStatus {
    NO_TAG,
    EMPTY_TAG,
    HAS_RESULTS,
}

/** What `categorize --mode` asks suggestions for; the values are the CLI's */
export enum CategorizeMode {
    Category = 'category',
    Budget = 'budget',
    Both = 'both',
}

/** The user's answer to one transaction's review prompt */
export enum ReviewAction {
    UpdateAll = 'all',
    UpdateBudget = 'budget',
    UpdateCategory = 'category',
    Edit = 'edit',
    Skip = 'skip',
}
