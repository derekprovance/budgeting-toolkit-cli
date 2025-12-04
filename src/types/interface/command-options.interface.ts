import { CategorizeMode } from '../enum/categorize-mode.enum.js';

export interface BudgetDateOptions {
    month?: number;
    year?: number;
    skipPaycheck?: boolean;
}

export interface CategorizeOptions {
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
