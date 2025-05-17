import { LLMTransactionCategoryService } from '../../../src/services/ai/llm-transaction-category.service';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ClaudeClient } from '../../../src/api/claude.client';

const mockClaudeClient = {
  chat: jest.fn(),
  chatBatch: jest.fn(),
  updateConfig: jest.fn(),
  getConfig: jest.fn(),
} as unknown as jest.Mocked<ClaudeClient>;

describe('LLMTransactionCategoryService', () => {
  let service: LLMTransactionCategoryService;

  beforeEach(() => {
    service = new LLMTransactionCategoryService(mockClaudeClient);
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

  it('assigns categories for valid transactions', async () => {
    mockClaudeClient.chat.mockResolvedValue(JSON.stringify({ category: 'Coffee & Tea' }));
    const result = await service.categorizeTransactions(tx, categories);
    expect(result).toEqual(['Coffee & Tea']);
  });

  it('returns empty string for invalid category', async () => {
    mockClaudeClient.chat.mockResolvedValue(JSON.stringify({ category: 'InvalidCategory' }));
    const result = await service.categorizeTransactions(tx, categories);
    expect(result).toEqual(['']);
  });

  it('returns array of empty strings if no categories provided', async () => {
    const result = await service.categorizeTransactions(tx, []);
    expect(result).toEqual(['']);
  });

  it('handles errors and retries, returns empty string on failure', async () => {
    mockClaudeClient.chat.mockRejectedValueOnce(new Error('Claude error'));
    mockClaudeClient.chat.mockResolvedValueOnce(JSON.stringify({ category: 'Coffee & Tea' }));
    const result = await service.categorizeTransactions(tx, categories);
    expect(result).toEqual(['Coffee & Tea']);
  });

  it('returns empty array for empty transactions', async () => {
    const result = await service.categorizeTransactions([], categories);
    expect(result).toEqual([]);
  });
}); 