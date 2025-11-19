import { UpdateTransactionStatus } from '../enum/update-transaction-status.enum';

export interface UpdateTransactionStatusDto {
    status: UpdateTransactionStatus;
    transactionsUpdated: number;
    transactionErrors?: number;
    error?: string;
}
