import { TransactionCategoryResult } from "../services/update-transaction.service";
import { UpdateTransactionStatus } from "../types/enum/update-transaction-status.enum";

export interface UpdateTransactionStatusDto {
  status: UpdateTransactionStatus;
  data: TransactionCategoryResult[] | null;
  totalTransactions: number,
  error?: string;
}
