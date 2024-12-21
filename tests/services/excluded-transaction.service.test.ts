import { ExcludedTransactionService } from '../../src/services/exluded-transaction.service';
import { createReadStream } from 'fs';
import { access } from 'fs/promises';
import { parse } from 'csv-parse';
import { finished } from 'stream/promises';

// Mock the dependencies
jest.mock('fs');
jest.mock('fs/promises');
jest.mock('csv-parse');
jest.mock('stream/promises');
jest.mock('../../src/logger');

interface MockParser {
  read?: jest.Mock;
  on: jest.Mock;
  pipe: jest.Mock;
}

describe('ExcludedTransactionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTransactions', () => {
    it('should return empty array when CSV file does not exist', async () => {
      // Mock access to throw error
      (access as jest.Mock).mockRejectedValueOnce(new Error('File not found'));

      const result = await ExcludedTransactionService.getTransactions();

      expect(result).toEqual([]);
      expect(access).toHaveBeenCalled();
    });

    it('should parse CSV file and return transactions when file exists', async () => {
      // Mock successful file access
      (access as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock CSV parsing
      const mockParser: MockParser = {
        read: jest.fn()
          .mockReturnValueOnce(['Description 1', '100'])
          .mockReturnValueOnce(['Description 2', '200'])
          .mockReturnValueOnce(null),
        on: jest.fn((event: string, callback: () => void): MockParser => {
          if (event === 'readable') {
            callback();
          }
          return mockParser;
        }),
        pipe: jest.fn(() => mockParser),
      };

      (createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn().mockReturnValue(mockParser) });
      (parse as jest.Mock).mockReturnValue(mockParser);
      (finished as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await ExcludedTransactionService.getTransactions();

      expect(result).toEqual([
        { description: 'Description 1', amount: '100' },
        { description: 'Description 2', amount: '200' },
      ]);
      expect(access).toHaveBeenCalled();
      expect(createReadStream).toHaveBeenCalled();
      expect(parse).toHaveBeenCalled();
    });

    it('should handle CSV parsing errors', async () => {
      // Mock successful file access
      (access as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock CSV parsing with error
      const mockError = new Error('CSV parsing error');
      const mockParser: MockParser = {
        on: jest.fn((event: string, callback: (error: Error) => void): MockParser => {
          if (event === 'error') {
            callback(mockError);
          }
          return mockParser;
        }),
        pipe: jest.fn(() => mockParser),
      };

      (createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn().mockReturnValue(mockParser) });
      (parse as jest.Mock).mockReturnValue(mockParser);

      await expect(ExcludedTransactionService.getTransactions()).rejects.toThrow('CSV parsing error');
    });

    it('should handle empty or malformed CSV records', async () => {
      // Mock successful file access
      (access as jest.Mock).mockResolvedValueOnce(undefined);

      // Mock CSV parsing with empty/malformed records
      const mockParser: MockParser = {
        read: jest.fn()
          .mockReturnValueOnce([])  // Empty record
          .mockReturnValueOnce(['Description only'])  // Missing amount
          .mockReturnValueOnce(null),
        on: jest.fn((event: string, callback: () => void): MockParser => {
          if (event === 'readable') {
            callback();
          }
          return mockParser;
        }),
        pipe: jest.fn().mockReturnThis(),
      };

      (createReadStream as jest.Mock).mockReturnValue({ pipe: jest.fn().mockReturnValue(mockParser) });
      (parse as jest.Mock).mockReturnValue(mockParser);
      (finished as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await ExcludedTransactionService.getTransactions();

      expect(result).toEqual([
        { description: '', amount: '' },
        { description: 'Description only', amount: '' },
      ]);
    });
  });
});