import { UpdateTransactionMode } from "../enum/update-transaction-mode.enum";
import { UpdateTransactionStatusDto } from "../dto/update-transaction-status.dto";

export interface UpdateTransactionService {
  updateTransactionsByTag(
    tag: string,
    updateMode: UpdateTransactionMode
  ): Promise<UpdateTransactionStatusDto>;
} 