import { UpdateTransactionMode } from '../enum/update-transaction-mode.enum';

export interface BudgetDateOptions {
    month?: number;
    year?: number;
}

export interface UpdateTransactionOptions {
    tag: string;
    mode: UpdateTransactionMode;
    includeClassified?: boolean;
    yes?: boolean;
    dryRun?: boolean;
}

export interface GlobalOptions {
    verbose?: boolean;
    quiet?: boolean;
}
