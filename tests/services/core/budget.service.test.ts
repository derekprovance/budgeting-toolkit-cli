import { BudgetService } from '../../../src/services/core/budget.service';
import { FireflyApiClient } from '../../../src/api/firefly.client';
import { BudgetArray, BudgetRead } from '@derekprovance/firefly-iii-sdk';

// Mock FireflyApiClient
jest.mock('../../../src/api/firefly.client');

describe('BudgetService', () => {
  let budgetService: BudgetService;
  let mockApiClient: jest.Mocked<FireflyApiClient>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Create a new mock instance of FireflyApiClient
    mockApiClient = new FireflyApiClient({
      baseUrl: 'test',
      apiToken: 'test'
    }) as jest.Mocked<FireflyApiClient>;
    
    // Create a new instance of BudgetService with the mock client
    budgetService = new BudgetService(mockApiClient);
  });

  describe('getBudgets', () => {
    it('should return only active budgets', async () => {
      // Mock data
      const mockBudgets: BudgetRead[] = [
        {
          id: '1',
          type: 'budgets',
          attributes: {
            name: 'Budget 1',
            active: true,
            order: 0,
            spent: [],
            auto_budget_type: undefined,
            auto_budget_period: undefined,
            auto_budget_currency_id: null,
            auto_budget_amount: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-01'
          }
        },
        {
          id: '2',
          type: 'budgets',
          attributes: {
            name: 'Budget 2',
            active: false,
            order: 1,
            spent: [],
            auto_budget_type: undefined,
            auto_budget_period: undefined,
            auto_budget_currency_id: null,
            auto_budget_amount: null,
            created_at: '2024-01-01',
            updated_at: '2024-01-01'
          }
        }
      ];

      // Mock the API response
      const mockResponse: BudgetArray = {
        data: mockBudgets,
        meta: {
          pagination: {
            total: 2,
            count: 2,
            per_page: 10,
            current_page: 1,
            total_pages: 1
          }
        }
      };

      // Setup the mock implementation
      mockApiClient.get.mockResolvedValue(mockResponse);

      // Execute the method
      const result = await budgetService.getBudgets();

      // Verify the results
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].attributes.name).toBe('Budget 1');
      expect(result[0].attributes.active).toBe(true);

      // Verify the API was called correctly
      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.get).toHaveBeenCalledWith('/budgets');
    });

    it('should handle empty budget list', async () => {
      // Mock empty response
      const mockResponse: BudgetArray = {
        data: [],
        meta: {
          pagination: {
            total: 0,
            count: 0,
            per_page: 10,
            current_page: 1,
            total_pages: 0
          }
        }
      };

      // Setup the mock implementation
      mockApiClient.get.mockResolvedValue(mockResponse);

      // Execute the method
      const result = await budgetService.getBudgets();

      // Verify the results
      expect(result).toHaveLength(0);
      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors', async () => {
      // Setup the mock to throw an error
      const mockError = new Error('API Error');
      mockApiClient.get.mockRejectedValue(mockError);

      // Execute and verify error handling
      await expect(budgetService.getBudgets()).rejects.toThrow('API Error');
      expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    });
  });
}); 