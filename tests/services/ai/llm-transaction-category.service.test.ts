import { TransactionSplit, TransactionTypeProperty } from '@derekprovance/firefly-iii-sdk';
import { LLMTransactionCategoryService } from '../../../src/services/ai/llm-transaction-category.service';
import { ClaudeClient } from '../../../src/api/claude.client';
import { LLMResponseValidator } from '../../../src/services/ai/llm-response-validator.service';

jest.mock('../../../src/api/claude.client');
jest.mock('../../../src/services/ai/llm-response-validator.service');

describe('LLMTransactionCategoryService', () => {
  let service: LLMTransactionCategoryService;
  let mockClaudeClient: jest.Mocked<ClaudeClient>;

  beforeEach(() => {
    mockClaudeClient = {
      chatBatch: jest.fn(),
      chat: jest.fn(),
      updateConfig: jest.fn(),
      getConfig: jest.fn(),
    } as unknown as jest.Mocked<ClaudeClient>;

    service = new LLMTransactionCategoryService(mockClaudeClient);
  });

  describe('categorizeTransactions', () => {
    const mockTransactions: TransactionSplit[] = [
      {
        transaction_journal_id: '1',
        description: 'Walmart Supercenter',
        amount: '150.00',
        type: 'withdrawal' as TransactionTypeProperty,
        date: new Date().toISOString(),
        source_id: 'source1',
        destination_id: 'dest1',
        currency_code: 'USD',
        foreign_amount: null,
        foreign_currency_code: null,
        budget_id: null,
        category_name: null,
        notes: null,
        external_id: null,
        order: null,
        tags: [],
        reconciled: false,
        bill_id: null,
        internal_reference: null,
        external_url: null,
        bunq_payment_id: null,
        sepa_ct_id: null,
        sepa_ct_op: null,
        sepa_db: null,
        sepa_country: null,
        sepa_ep: null,
        sepa_ci: null,
        sepa_batch_id: null,
        interest_date: null,
        book_date: null,
        process_date: null,
        due_date: null,
        payment_date: null,
        invoice_date: null,
        latitude: null,
        longitude: null,
        zoom_level: null,
        has_attachments: false
      },
      {
        transaction_journal_id: '2',
        description: 'Walmart Pharmacy',
        amount: '25.00',
        type: 'withdrawal' as TransactionTypeProperty,
        date: new Date().toISOString(),
        source_id: 'source1',
        destination_id: 'dest1',
        currency_code: 'USD',
        foreign_amount: null,
        foreign_currency_code: null,
        budget_id: null,
        category_name: null,
        notes: null,
        external_id: null,
        order: null,
        tags: [],
        reconciled: false,
        bill_id: null,
        internal_reference: null,
        external_url: null,
        bunq_payment_id: null,
        sepa_ct_id: null,
        sepa_ct_op: null,
        sepa_db: null,
        sepa_country: null,
        sepa_ep: null,
        sepa_ci: null,
        sepa_batch_id: null,
        interest_date: null,
        book_date: null,
        process_date: null,
        due_date: null,
        payment_date: null,
        invoice_date: null,
        latitude: null,
        longitude: null,
        zoom_level: null,
        has_attachments: false
      }
    ];

    const categories = ['Groceries', 'Healthcare', 'Shopping'];

    it('should process single transaction', async () => {
      const singleTransaction = [mockTransactions[0]];
      const expectedResponse = 'Groceries';
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Groceries']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce(['Groceries']);
      
      const result = await service.categorizeTransactions(categories, singleTransaction);
      
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Transaction: Walmart Supercenter'),
            }),
          ]),
        ]),
        expect.any(Object)
      );
      expect(result).toEqual(['Groceries']);
    });

    it('should process multiple transactions in batches', async () => {
      const expectedResponses = ['Groceries', 'Healthcare'];
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce(expectedResponses);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Groceries', 'Healthcare']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce(['Groceries', 'Healthcare']);

      const result = await service.categorizeTransactions(categories, mockTransactions);
      
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Transaction 1:'),
            }),
          ]),
        ]),
        expect.any(Object)
      );
      expect(result).toEqual(['Groceries', 'Healthcare']);
    });

    it('should return empty string for transactions without matching category', async () => {
      const singleTransaction = [mockTransactions[0]];
      const expectedResponse = '';
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce(['']);

      const result = await service.categorizeTransactions(categories, singleTransaction);
      
      expect(result).toEqual(['']);
    });

    it('should handle transactions with missing descriptions', async () => {
      const transactionWithMissingDescription = {
        ...mockTransactions[0],
        description: '',
      };
      
      const expectedResponse = '';
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce(['']);

      const result = await service.categorizeTransactions(
        categories,
        [transactionWithMissingDescription]
      );
      
      expect(result).toEqual(['']);
    });

    it('should handle transactions with missing amounts', async () => {
      const transactionWithMissingAmount = {
        ...mockTransactions[0],
        amount: '',
      };
      
      const expectedResponse = '';
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce(['']);

      const result = await service.categorizeTransactions(
        categories,
        [transactionWithMissingAmount]
      );
      
      expect(result).toEqual(['']);
    });

    it('should handle transactions with missing dates', async () => {
      const transactionWithMissingDate = {
        ...mockTransactions[0],
        date: '',
      };
      
      const expectedResponse = '';
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce(['']);

      const result = await service.categorizeTransactions(
        categories,
        [transactionWithMissingDate]
      );
      
      expect(result).toEqual(['']);
    });

    it('should handle transactions with null values', async () => {
      const transactionWithNullValues = {
        ...mockTransactions[0],
        description: '',
        amount: '',
        date: '',
      };
      
      const expectedResponse = '';
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce(['']);

      const result = await service.categorizeTransactions(
        categories,
        [transactionWithNullValues]
      );
      
      expect(result).toEqual(['']);
    });

    it('should handle validation errors', async () => {
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid category');
      });

      await expect(service.categorizeTransactions(categories, mockTransactions))
        .rejects.toThrow('Invalid category');
    }, 10000);

    it('should retry on failure', async () => {
      const expectedResponse = '{"categories": ["Groceries", "Healthcare"]}';
      
      mockClaudeClient.chatBatch
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce([expectedResponse]);
      
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Groceries', 'Healthcare']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce(['Groceries', 'Healthcare']);

      const result = await service.categorizeTransactions(categories, mockTransactions);
      
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(['Groceries', 'Healthcare']);
    }, 10000);

    it('should fail after max retries', async () => {
      mockClaudeClient.chatBatch.mockReset();
      mockClaudeClient.chatBatch.mockRejectedValue(new Error('API Error'));

      await expect(service.categorizeTransactions(categories, mockTransactions))
        .rejects.toThrow('API Error');
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(4);
    }, 10000);
  });
}); 