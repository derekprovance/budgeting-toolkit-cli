import { UpdateTransactionStatus } from "../enum/update-transaction-status.enum";

export interface UpdateTransactionStatusDto {
  status: UpdateTransactionStatus;
  data?: UpdateTransactionResult[];
  totalTransactions: number;
  error?: string;
}

export interface UpdateTransactionResult {
  name: string;
  category?: string | null;
  updatedCategory?: string;
  budget?: string | null;
  updatedBudget?: string;
} 