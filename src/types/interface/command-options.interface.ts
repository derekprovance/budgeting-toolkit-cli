import { CategorizeMode } from '../enums.js';

export interface BudgetDateOptions {
    month?: number;
    year?: number;
}

export interface CategorizeCliOptions {
    mode: CategorizeMode;
    force?: boolean;
    dryRun?: boolean;
}
