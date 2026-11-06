import { CategorizeMode } from '../enums.js';

export interface BudgetDateOptions {
    month?: number;
    year?: number;
}

export interface CategorizeOptions {
    mode: CategorizeMode;
    force?: boolean;
    dryRun?: boolean;
}

export interface GlobalOptions {
    verbose?: boolean;
    quiet?: boolean;
}
