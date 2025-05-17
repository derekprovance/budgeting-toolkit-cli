import { LLMTransactionCategoryService } from '../../../src/services/ai/llm-transaction-category.service';
import { LLMTransactionBudgetService } from '../../../src/services/ai/llm-transaction-budget.service';

export interface MockCategoryService extends Pick<LLMTransactionCategoryService, 'categorizeTransactions'> {
  categorizeTransactions: jest.Mock;
}

export interface MockBudgetService extends Pick<LLMTransactionBudgetService, 'assignBudgets'> {
  assignBudgets: jest.Mock;
} 