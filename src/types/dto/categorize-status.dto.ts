import { CategorizeStatus } from '../enum/categorize-status.enum.js';

export interface CategorizeStatusDto {
    status: CategorizeStatus;
    transactionsUpdated: number;
    transactionErrors?: number;
    error?: string;
}
