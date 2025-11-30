import { CategorizeMode } from '../enum/categorize-mode.enum.js';

export interface BudgetDateOptions {
    month?: number;
    year?: number;
}

export interface UpdateTransactionOptions {
    tag: string;
    mode: CategorizeMode;
    includeClassified?: boolean;
    yes?: boolean;
    dryRun?: boolean;
}

export interface GlobalOptions {
    verbose?: boolean;
    quiet?: boolean;
}
