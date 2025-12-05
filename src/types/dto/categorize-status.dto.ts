import { CategorizeStatus } from '../enums.js';

export interface CategorizeStatusDto {
    status: CategorizeStatus;
    transactionsUpdated: number;
    transactionErrors?: number;
    error?: string;
}
