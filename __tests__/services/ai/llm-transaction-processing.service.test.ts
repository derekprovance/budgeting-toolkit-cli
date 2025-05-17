import { LLMTransactionProcessingService } from '../../../src/services/ai/llm-transaction-processing.service';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { LLMTransactionCategoryService } from '../../../src/services/ai/llm-transaction-category.service';
import { LLMTransactionBudgetService } from '../../../src/services/ai/llm-transaction-budget.service';

const mockCategoryService = {
  categorizeTransactions: jest.fn(),
} as unknown as jest.Mocked<LLMTransactionCategoryService>;

const mockBudgetService = {
  assignBudgets: jest.fn(),
} as unknown as jest.Mocked<LLMTransactionBudgetService>;

describe('LLMTransactionProcessingService', () => {
  let service: LLMTransactionProcessingService;

  beforeEach(() => {
    service = new LLMTransactionProcessingService(
      mockCategoryService,
      mockBudgetService
    );
    jest.clearAllMocks();
  });

  const tx: TransactionSplit[] = [{
    description: 'STARBUCKS',
    amount: '5',
    date: '2024-01-01',
    source_name: 'Checking',
    destination_name: 'Starbucks',
    type: 'withdrawal',
    notes: '',
    transaction_journal_id: '1',
  } as TransactionSplit];
  const categories = ['Coffee & Tea', 'Dining Out'];
  const budgets = ['Groceries', 'Dining Out'];

  it('processes both categories and budgets', async () => {
    mockCategoryService.categorizeTransactions.mockResolvedValue(['Coffee & Tea']);
    mockBudgetService.assignBudgets.mockResolvedValue(['Groceries']);
    const result = await service.processTransactions(tx, categories, budgets);
    expect(result['1']).toEqual({ category: 'Coffee & Tea', budget: 'Groceries' });
  });

  it('processes category-only mode', async () => {
    mockCategoryService.categorizeTransactions.mockResolvedValue(['Coffee & Tea']);
    const result = await service.processTransactions(tx, categories, undefined);
    expect(result['1']).toEqual({ category: 'Coffee & Tea' });
  });

  it('processes budget-only mode', async () => {
    mockBudgetService.assignBudgets.mockResolvedValue(['Groceries']);
    const result = await service.processTransactions(tx, undefined, budgets);
    expect(result['1']).toEqual({ budget: 'Groceries' });
  });

  it('returns empty object for empty transactions', async () => {
    const result = await service.processTransactions([], categories, budgets);
    expect(result).toEqual({});
  });

  it('handles category service errors gracefully', async () => {
    mockCategoryService.categorizeTransactions.mockRejectedValue(new Error('Category service error'));
    const result = await service.processTransactions(tx, categories, budgets);
    expect(result['1']).toEqual({ budget: 'Groceries' });
  });

  it('handles budget service errors gracefully', async () => {
    mockCategoryService.categorizeTransactions.mockResolvedValue(['Coffee & Tea']);
    mockBudgetService.assignBudgets.mockRejectedValue(new Error('Budget service error'));
    const result = await service.processTransactions(tx, categories, budgets);
    expect(result['1']).toEqual({ category: 'Coffee & Tea' });
  });

  describe('transaction similarity', () => {
    it('calculates high similarity for identical transactions', () => {
      const tx1 = { description: 'STARBUCKS', amount: '5' } as TransactionSplit;
      const tx2 = { description: 'STARBUCKS', amount: '5' } as TransactionSplit;
      // @ts-expect-error Testing private method
      const similarity = service.calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(1.0);
    });

    it('calculates high similarity for same merchant with similar amounts', () => {
      const tx1 = { description: 'STARBUCKS', amount: '5' } as TransactionSplit;
      const tx2 = { description: 'STARBUCKS', amount: '4' } as TransactionSplit;
      // @ts-expect-error Testing private method
      const similarity = service.calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(1.0);
    });

    it('calculates high similarity for same payment platform and recipient', () => {
      const tx1 = { description: 'Venmo to John Smith', amount: '20' } as TransactionSplit;
      const tx2 = { description: 'Venmo to John Smith', amount: '20' } as TransactionSplit;
      // @ts-expect-error Testing private method
      const similarity = service.calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(1.0);
    });

    it('calculates high similarity for same payment platform with similar amounts', () => {
      const tx1 = { description: 'Venmo to John Smith', amount: '20' } as TransactionSplit;
      const tx2 = { description: 'Venmo to John Smith', amount: '18' } as TransactionSplit;
      // @ts-expect-error Testing private method
      const similarity = service.calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(1.0);
    });

    it('calculates low similarity for different payment platforms', () => {
      const tx1 = { description: 'Venmo to John Smith', amount: '20' } as TransactionSplit;
      const tx2 = { description: 'PayPal to John Smith', amount: '20' } as TransactionSplit;
      // @ts-expect-error Testing private method
      const similarity = service.calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(0.3);
    });

    it('calculates very low similarity for payment platform vs non-payment platform', () => {
      const tx1 = { description: 'Venmo to John Smith', amount: '20' } as TransactionSplit;
      const tx2 = { description: 'STARBUCKS', amount: '20' } as TransactionSplit;
      // @ts-expect-error Testing private method
      const similarity = service.calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(0.1);
    });

    it('returns 0 for transactions without descriptions', () => {
      const tx1 = { amount: '5' } as TransactionSplit;
      const tx2 = { amount: '5' } as TransactionSplit;
      // @ts-expect-error Testing private method
      const similarity = service.calculateTransactionSimilarity(tx1, tx2);
      expect(similarity).toBe(0.0);
    });
  });
}); 