import { AIService } from "./ai.service";
import { TransactionService } from "./transaction.service";

export class UpdateCategoryService {
  constructor(
    private transactionService: TransactionService,
    private aiService: AIService
  ) {}

  async updateCategoriesByTag(tag: string): Promise<void> {
    const transactions = this.transactionService.getTransactionsByTag(tag);
  }
}
