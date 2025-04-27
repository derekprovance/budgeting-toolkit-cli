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
      const singleTransaction = [mockTransactions[0]];
      const expectedResponse = 'Groceries';
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid category');
      });

      await expect(service.categorizeTransactions(categories, singleTransaction))
        .rejects.toThrow('Invalid category');
    }, 10000);

    it('should retry on failure', async () => {
      const expectedResponse = '{"categories": ["Groceries", "Healthcare"]}';
      
      mockClaudeClient.chatBatch
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce([expectedResponse, expectedResponse]);
      
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Groceries', 'Healthcare']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce(['Groceries', 'Healthcare']);

      const result = await service.categorizeTransactions(categories, mockTransactions);
      
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(['Groceries', 'Healthcare']);
    }, 10000);

    it('should handle empty transactions array', async () => {
      const result = await service.categorizeTransactions(categories, []);
      expect(result).toEqual([]);
      expect(mockClaudeClient.chatBatch).not.toHaveBeenCalled();
    }, 10000);

    it('should handle empty categories array', async () => {
      const result = await service.categorizeTransactions([], mockTransactions);
      expect(result).toEqual(['', '']);
      expect(mockClaudeClient.chatBatch).not.toHaveBeenCalled();
    }, 10000);

    it('should handle category name case sensitivity', async () => {
      const singleTransaction = [mockTransactions[0]];
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['groceries']); // lowercase response
      
      await expect(service.categorizeTransactions(categories, singleTransaction))
        .rejects.toThrow('Invalid category');
    });

    it('should handle whitespace in category responses', async () => {
      const singleTransaction = [mockTransactions[0]];
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['  Groceries  ']); // extra whitespace
      
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Groceries']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce('Groceries');

      const result = await service.categorizeTransactions(categories, singleTransaction);
      expect(result).toEqual(['Groceries']);
    });

    it('should properly categorize Venmo transactions', async () => {
      const paymentTransaction = {
        ...mockTransactions[0],
        description: 'Venmo payment to John Smith for dinner'
      };
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['Dining Out']);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Dining Out']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce('Dining Out');

      const result = await service.categorizeTransactions(
        [...categories, 'Dining Out'],
        [paymentTransaction]
      );
      
      expect(result).toEqual(['Dining Out']);
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Recipient: John Smith')
            })
          ])
        ]),
        expect.any(Object)
      );
    });

    it('should properly categorize PayPal transactions', async () => {
      const paymentTransaction = {
        ...mockTransactions[0],
        description: 'PayPal payment to Online Store'
      };
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['Shopping']);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Shopping']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce('Shopping');

      const result = await service.categorizeTransactions(categories, [paymentTransaction]);
      expect(result).toEqual(['Shopping']);
    });

    it('should handle timeout from Claude API', async () => {
      const singleTransaction = [mockTransactions[0]];
      
      mockClaudeClient.chatBatch
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockRejectedValueOnce(new Error('Request timeout'));

      await expect(service.categorizeTransactions(categories, singleTransaction))
        .rejects.toThrow('Request timeout');
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    }, 10000);

    it('should handle malformed responses from Claude', async () => {
      const singleTransaction = [mockTransactions[0]];
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['{"category": "Groceries"}']); // Wrong format
      
      await expect(service.categorizeTransactions(categories, singleTransaction))
        .rejects.toThrow('Invalid category');
    });

    it('should handle special characters in transaction descriptions', async () => {
      const transactionWithSpecialChars = {
        ...mockTransactions[0],
        description: 'Café & Restaurant™ #123'
      };
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['Groceries']);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Groceries']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce('Groceries');

      const result = await service.categorizeTransactions(categories, [transactionWithSpecialChars]);
      
      expect(result).toEqual(['Groceries']);
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('Café & Restaurant™ #123')
            })
          ])
        ]),
        expect.any(Object)
      );
    });

    it('should handle rate limiting from Claude API', async () => {
      const singleTransaction = [mockTransactions[0]];
      
      mockClaudeClient.chatBatch
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce(['Groceries']); // Succeeds after rate limit cooldown

      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Groceries']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock).mockReturnValueOnce('Groceries');

      const result = await service.categorizeTransactions(categories, singleTransaction);
      expect(result).toEqual(['Groceries']);
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(3);
    });

    it('should handle mismatched response lengths from Claude', async () => {
      const singleTransaction = [mockTransactions[0]];
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['Groceries', 'Healthcare']); // More responses than transactions
      
      // Don't mock validateBatchResponses since we want to test the length check
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockImplementation((responses) => {
        if (responses.length !== 1) {
          throw new Error('Invalid response from Claude');
        }
        return responses;
      });

      await expect(service.categorizeTransactions(categories, singleTransaction))
        .rejects.toThrow('Invalid response from Claude');
    }, 10000);

    it('should maintain consistent categorization for similar transactions', async () => {
      const similarTransactions = [
        {...mockTransactions[0], description: 'Walmart Grocery'},
        {...mockTransactions[0], description: 'Walmart Supermarket'}
      ];
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['Groceries', 'Groceries']);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Groceries', 'Groceries']);
      (LLMResponseValidator.validateCategoryResponse as jest.Mock)
        .mockReturnValueOnce('Groceries')
        .mockReturnValueOnce('Groceries');

      const result = await service.categorizeTransactions(categories, similarTransactions);
      expect(result[0]).toEqual(result[1]); // Should assign same category
      expect(result).toEqual(['Groceries', 'Groceries']);
    });
  });
}); 