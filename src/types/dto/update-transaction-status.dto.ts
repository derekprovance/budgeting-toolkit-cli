import { CategorizeStatus } from '../enum/categorize-status.enum.js';

export interface UpdateTransactionStatusDto {
    status: CategorizeStatus;
    transactionsUpdated: number;
    transactionErrors?: number;
    error?: string;
}
