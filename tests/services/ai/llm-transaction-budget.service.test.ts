import { TransactionSplit, TransactionTypeProperty } from '@derekprovance/firefly-iii-sdk';
import { LLMTransactionBudgetService } from '../../../src/services/ai/llm-transaction-budget.service';
import { ClaudeClient } from '../../../src/api/claude.client';
import { LLMResponseValidator } from '../../../src/services/ai/llm-response-validator.service';

jest.mock('../../../src/api/claude.client');
jest.mock('../../../src/services/ai/llm-response-validator.service');

describe('LLMTransactionBudgetService', () => {
  let service: LLMTransactionBudgetService;
  let mockClaudeClient: jest.Mocked<ClaudeClient>;

  beforeEach(() => {
    mockClaudeClient = {
      chatBatch: jest.fn(),
      chat: jest.fn(),
      updateConfig: jest.fn(),
      getConfig: jest.fn(),
    } as unknown as jest.Mocked<ClaudeClient>;

    service = new LLMTransactionBudgetService(mockClaudeClient);
  });

  describe('assignBudgets', () => {
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

    const budgets = ['Food', 'Medical', 'Shopping'];
    const categories = ['Groceries', 'Healthcare', 'Shopping'];

    it('should process single transaction', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      const expectedResponse = 'Food';
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Food']);
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce('Food');
      
      const result = await service.assignBudgets(budgets, singleTransaction, singleCategory);
      
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Description: Walmart Supercenter'),
            }),
          ]),
        ]),
        expect.any(Object)
      );
      expect(result).toEqual(['Food']);
    });

    it('should process multiple transactions in batches', async () => {
      const expectedResponses = ['Food', 'Medical'];
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce(expectedResponses);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Food', 'Medical']);
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce('Food').mockReturnValueOnce('Medical');

      const result = await service.assignBudgets(budgets, mockTransactions, categories.slice(0, 2));
      
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
      expect(result).toEqual(['Food', 'Medical']);
    });

    it('should handle validation errors', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      const expectedResponse = 'Food';
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid budget');
      });

      await expect(service.assignBudgets(budgets, singleTransaction, singleCategory))
        .rejects.toThrow('Invalid budget');
    }, 10000);

    it('should retry on failure', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      const expectedResponse = '{"budgets": ["Food"]}';
      
      mockClaudeClient.chatBatch
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce([expectedResponse]);
      
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Food']);
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce(['Food']);

      const result = await service.assignBudgets(budgets, singleTransaction, singleCategory);
      
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(['Food']);
    }, 10000);

    it('should fail after max retries', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      
      mockClaudeClient.chatBatch.mockReset();
      mockClaudeClient.chatBatch.mockRejectedValue(new Error('API Error'));

      await expect(service.assignBudgets(budgets, singleTransaction, singleCategory))
        .rejects.toThrow('API Error');
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(4);
    }, 10000);

    it('should return empty string for transactions without matching budget', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      const expectedResponse = '';
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['']);
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce(['']);

      const result = await service.assignBudgets(budgets, singleTransaction, singleCategory);
      
      expect(result).toEqual(['']);
    });

    it('should handle empty transactions array', async () => {
      const result = await service.assignBudgets(budgets, [], []);
      expect(result).toEqual([]);
      expect(mockClaudeClient.chatBatch).not.toHaveBeenCalled();
    });

    it('should handle mismatched transaction and category lengths', async () => {
      const singleTransaction = [mockTransactions[0]];
      const multipleCategories = ['Groceries', 'Healthcare'];
      
      await expect(service.assignBudgets(budgets, singleTransaction, multipleCategories))
        .rejects.toThrow('Number of transactions and categories must match');
      expect(mockClaudeClient.chatBatch).not.toHaveBeenCalled();
    });

    it('should handle empty budgets array', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      
      const result = await service.assignBudgets([], singleTransaction, singleCategory);
      expect(result).toEqual(['']);
      expect(mockClaudeClient.chatBatch).not.toHaveBeenCalled();
    });

    it('should handle transactions with missing descriptions', async () => {
      const transactionWithMissingDescription = {
        ...mockTransactions[0],
        description: '',
      };
      
      const expectedResponse = '';
      mockClaudeClient.chatBatch.mockResolvedValueOnce([expectedResponse]);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['']);
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce('');

      const result = await service.assignBudgets(
        budgets,
        [transactionWithMissingDescription],
        [categories[0]]
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
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce('');

      const result = await service.assignBudgets(
        budgets,
        [transactionWithMissingAmount],
        [categories[0]]
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
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce('');

      const result = await service.assignBudgets(
        budgets,
        [transactionWithMissingDate],
        [categories[0]]
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
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce('');

      const result = await service.assignBudgets(
        budgets,
        [transactionWithNullValues],
        [categories[0]]
      );
      
      expect(result).toEqual(['']);
    });

    it('should handle budget name case sensitivity', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['food']); // lowercase response
      
      await expect(service.assignBudgets(budgets, singleTransaction, singleCategory))
        .rejects.toThrow('Invalid budget');
    });

    it('should handle whitespace in budget responses', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['  Food  ']); // extra whitespace
      
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Food']);
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce('Food');

      const result = await service.assignBudgets(budgets, singleTransaction, singleCategory);
      expect(result).toEqual(['Food']);
    });

    it('should maintain consistent budget assignment for similar transactions', async () => {
      const similarTransactions = [
        {...mockTransactions[0], description: 'Walmart Grocery'},
        {...mockTransactions[0], description: 'Walmart Supermarket'}
      ];
      const transactionCategories = ['Groceries', 'Groceries'];
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['Food', 'Food']);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Food', 'Food']);
      (LLMResponseValidator.validateBudgetResponse as jest.Mock)
        .mockReturnValueOnce('Food')
        .mockReturnValueOnce('Food');

      const result = await service.assignBudgets(budgets, similarTransactions, transactionCategories);
      expect(result[0]).toEqual(result[1]); // Should assign same budget
      expect(result).toEqual(['Food', 'Food']);
    });

    it('should handle timeout from Claude API', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      
      mockClaudeClient.chatBatch
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockRejectedValueOnce(new Error('Request timeout'))
        .mockRejectedValueOnce(new Error('Request timeout'));

      await expect(service.assignBudgets(budgets, singleTransaction, singleCategory))
        .rejects.toThrow('Request timeout');
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    }, 10000);

    it('should handle malformed responses from Claude', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['{"budget": "Food"}']); // Wrong format
      
      await expect(service.assignBudgets(budgets, singleTransaction, singleCategory))
        .rejects.toThrow('Invalid budget');
    });

    it('should handle special characters in transaction descriptions', async () => {
      const transactionWithSpecialChars = {
        ...mockTransactions[0],
        description: 'Café & Restaurant™ #123'
      };
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['Food']);
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Food']);
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce('Food');

      const result = await service.assignBudgets(
        budgets,
        [transactionWithSpecialChars],
        [categories[0]]
      );
      
      expect(result).toEqual(['Food']);
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
      const singleCategory = [categories[0]];
      
      mockClaudeClient.chatBatch
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValueOnce(['Food']); // Succeeds after rate limit cooldown

      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockResolvedValueOnce(['Food']);
      (LLMResponseValidator.validateBudgetResponse as jest.Mock).mockReturnValueOnce('Food');

      const result = await service.assignBudgets(budgets, singleTransaction, singleCategory);
      expect(result).toEqual(['Food']);
      expect(mockClaudeClient.chatBatch).toHaveBeenCalledTimes(3);
    });

    it('should handle mismatched response lengths from Claude', async () => {
      const singleTransaction = [mockTransactions[0]];
      const singleCategory = [categories[0]];
      
      mockClaudeClient.chatBatch.mockResolvedValueOnce(['Groceries Budget', 'Healthcare Budget']); // More responses than transactions
      
      // Don't mock validateBatchResponses since we want to test the length check
      (LLMResponseValidator.validateBatchResponses as jest.Mock).mockImplementation((responses) => {
        if (responses.length !== 1) {
          throw new Error('Invalid response from Claude');
        }
        return responses;
      });

      await expect(service.assignBudgets(budgets, singleTransaction, singleCategory))
        .rejects.toThrow('Invalid response from Claude');
    }, 10000); // Increased timeout to 10 seconds
  });
}); 