import { BudgetLimitRead, BudgetRead } from '@derekprovance/firefly-iii-sdk';

export interface IBudgetService {
    /** Active budgets; inactive ones too when `includeInactive` is set */
    getBudgets(includeInactive?: boolean): Promise<BudgetRead[]>;
    getBudgetLimits(month: number, year: number): Promise<BudgetLimitRead[]>;
}
