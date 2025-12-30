import { BudgetDisplayService } from '../../../src/services/display/budget-display.service.js';
import { BaseTransactionDisplayService } from '../../../src/services/display/base-transaction-display.service.js';
import { TransactionClassificationService } from '../../../src/services/core/transaction-classification.service.js';
import { ExcludedTransactionService } from '../../../src/services/excluded-transaction.service.js';
import { BudgetReport } from '../../../src/types/interface/budget-report.interface.js';
import { jest } from '@jest/globals';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

// Mock chalk to return the input string (disable styling for tests)
jest.mock('chalk', () => ({
    default: {
        redBright: (str: string) => str,
        cyan: (str: string) => str,
        yellow: (str: string) => str,
        gray: (str: string) => str,
        bold: (str: string) => str,
        green: (str: string) => str,
        red: (str: string) => str,
        cyanBright: (str: string) => str,
        white: (str: string) => str,
    },
}));

jest.mock('../../../src/services/display/base-transaction-display.service');
jest.mock('../../../src/services/core/transaction-classification.service');
jest.mock('../../../src/services/excluded-transaction.service');

describe('BudgetDisplayService', () => {
    let service: BudgetDisplayService;
    let baseTransactionDisplayService: jest.Mocked<BaseTransactionDisplayService>;
    let transactionClassificationService: jest.Mocked<TransactionClassificationService>;
    let excludedTransactionService: jest.Mocked<ExcludedTransactionService>;

    beforeEach(() => {
        excludedTransactionService =
            new ExcludedTransactionService() as jest.Mocked<ExcludedTransactionService>;
        transactionClassificationService = new TransactionClassificationService(
            excludedTransactionService
        ) as jest.Mocked<TransactionClassificationService>;
        baseTransactionDisplayService = new BaseTransactionDisplayService(
            transactionClassificationService
        ) as jest.Mocked<BaseTransactionDisplayService>;

        // Mock the displayService methods
        baseTransactionDisplayService.listTransactionsWithHeader = jest
            .fn<(transactions: TransactionSplit[], description: string) => string>()
            .mockReturnValue('=== Unbudgeted Transactions ===\n\nNo transactions found');
        baseTransactionDisplayService.formatBudgetTransaction = jest
            .fn<(transaction: TransactionSplit, transactionId: string) => string>()
            .mockReturnValue('  $100.00  Test Transaction  1/15/2025');

        service = new BudgetDisplayService(baseTransactionDisplayService);
    });

    describe('formatHeader', () => {
        it('should format header with current month info', () => {
            const result = service.formatHeader(5, 2024, 15, 50, new Date('2024-05-15'));
            expect(result).toContain('Budget Report');
            expect(result).toContain('May 2024');
            expect(result).toContain('15 days remaining');
            expect(result).toContain('Last Updated: 2024-05-15');
        });

        it('should format header without current month info', () => {
            const result = service.formatHeader(5, 2024);
            expect(result).toContain('Budget Report');
            expect(result).toContain('May 2024');
            expect(result).not.toContain('days remaining');
            expect(result).not.toContain('Last Updated');
        });
    });

    describe('formatBudgetItem', () => {
        const mockStatus: BudgetReport = {
            name: 'Test Budget',
            amount: 1000,
            spent: -500,
        };

        it('should format budget item for current month', () => {
            const result = service.formatBudgetItem(mockStatus, 20, true, 15, 30);
            expect(result).toContain('Test Budget');
            expect(result).toContain('$500.00');
            expect(result).toContain('$1,000.00');
            expect(result).toContain('50.0%');
            expect(result).toContain('Remaining: $500.00');
        });

        it('should format budget item for non-current month', () => {
            const result = service.formatBudgetItem(mockStatus, 20, false);
            expect(result).toContain('Test Budget');
            expect(result).toContain('$500.00');
            expect(result).toContain('$1,000.00');
            expect(result).toContain('50.0%');
            expect(result).toContain('Remaining: $500.00');
        });
    });

    describe('formatSummary', () => {
        it('should format summary for current month', () => {
            const result = service.formatSummary(500, 1000, 20, true, 15, 30);
            expect(result).toContain('TOTAL');
            expect(result).toContain('$500.00');
            expect(result).toContain('$1,000.00');
            expect(result).toContain('50.0%');
        });

        it('should format summary for non-current month', () => {
            const result = service.formatSummary(500, 1000, 20, false);
            expect(result).toContain('TOTAL');
            expect(result).toContain('$500.00');
            expect(result).toContain('$1,000.00');
            expect(result).toContain('50.0%');
        });
    });

    describe('getSpendRateWarning', () => {
        it('should return warning when spend rate is too high', () => {
            const result = service.getSpendRateWarning(80, 30);
            expect(result).toContain('Warning: Current spend rate is higher than ideal');
        });

        it('should return null when spend rate is acceptable', () => {
            const result = service.getSpendRateWarning(30, 40);
            expect(result).toBeNull();
        });
    });

    describe('formatBillComparisonSection', () => {
        const mockComparison = {
            predictedTotal: 1000,
            actualTotal: 950,
            variance: -50,
            bills: [
                { id: '1', name: 'Electric', predicted: 150, actual: 140, frequency: 'monthly' },
                { id: '2', name: 'Water', predicted: 50, actual: 60, frequency: 'monthly' },
                { id: '3', name: 'Internet', predicted: 80, actual: 0, frequency: 'monthly' },
            ],
            currencyCode: 'USD',
            currencySymbol: '$',
        };

        it('should format bill comparison without verbose flag', () => {
            const result = service.formatBillComparisonSection(mockComparison, false);
            expect(result).toContain('=== Bill Comparison ===');
            expect(result).toContain('$1000.00');
            expect(result).toContain('$950.00');
            expect(result).toContain('Variance:');
            expect(result).toContain('Under $50.00');
            expect(result).not.toContain('Bill Details:');
            expect(result).not.toContain('Electric');
            expect(result).not.toContain('Water');
        });

        it('should format bill comparison with verbose flag showing bill details', () => {
            const result = service.formatBillComparisonSection(mockComparison, true);
            expect(result).toContain('=== Bill Comparison ===');
            expect(result).toContain('$1000.00');
            expect(result).toContain('$950.00');
            expect(result).toContain('Bill Details:');
            expect(result).toContain('Electric');
            expect(result).toContain('$140.00');
            expect(result).toContain('predicted: $150.00');
            expect(result).toContain('Water');
            expect(result).toContain('$60.00');
            expect(result).toContain('predicted: $50.00');
            expect(result).not.toContain('Internet');
        });

        it('should handle positive variance (over budget)', () => {
            const overBudgetComparison = {
                ...mockComparison,
                actualTotal: 1100,
                variance: 100,
            };
            const result = service.formatBillComparisonSection(overBudgetComparison, false);
            expect(result).toContain('Over $100.00');
        });

        it('should handle no bills configured', () => {
            const noBillsComparison = {
                predictedTotal: 0,
                actualTotal: 0,
                variance: 0,
                bills: [],
                currencyCode: 'USD',
                currencySymbol: '$',
            };
            const result = service.formatBillComparisonSection(noBillsComparison);
            expect(result).toContain('No bills configured');
        });

        it('should only show bills with actual amounts > 0 when verbose', () => {
            const result = service.formatBillComparisonSection(mockComparison, true);
            expect(result).toContain('Electric');
            expect(result).toContain('Water');
            expect(result).not.toContain('Internet');
        });
    });

    describe('formatBudgetTransactions', () => {
        const mockTransaction1: TransactionSplit = {
            description: 'Transaction 1',
            amount: '100.00',
            currency_symbol: '$',
            date: '2025-01-15T00:00:00Z',
            transaction_journal_id: '123',
        } as TransactionSplit;

        const mockTransaction2: TransactionSplit = {
            description: 'Transaction 2',
            amount: '75.00',
            currency_symbol: '$',
            date: '2025-01-20T00:00:00Z',
            transaction_journal_id: '456',
        } as TransactionSplit;

        it('should return empty string when no transactions provided', () => {
            const result = service.formatBudgetTransactions([], 'Groceries');
            expect(result).toBe('');
        });

        it('should format budget transaction list with header', () => {
            (baseTransactionDisplayService.formatBudgetTransaction as jest.Mock)
                .mockReturnValueOnce('  $100.00  Transaction 1  1/15/2025')
                .mockReturnValueOnce('  $75.00  Transaction 2  1/20/2025');

            const result = service.formatBudgetTransactions(
                [mockTransaction1, mockTransaction2],
                'Groceries'
            );

            expect(result).toContain('Transactions for Groceries:');
            expect(result).toContain('  $100.00  Transaction 1  1/15/2025');
            expect(result).toContain('  $75.00  Transaction 2  1/20/2025');
        });

        it('should display single transaction', () => {
            (
                baseTransactionDisplayService.formatBudgetTransaction as jest.Mock
            ).mockReturnValueOnce('  $100.00  Transaction 1  1/15/2025');

            const result = service.formatBudgetTransactions([mockTransaction1], 'Groceries');

            expect(result).toContain('Transactions for Groceries:');
            expect(result).toContain('  $100.00  Transaction 1  1/15/2025');
        });

        it('should delegate formatting to BaseTransactionDisplayService', () => {
            (baseTransactionDisplayService.formatBudgetTransaction as jest.Mock).mockReturnValue(
                'formatted'
            );

            service.formatBudgetTransactions([mockTransaction1, mockTransaction2], 'Bills');

            expect(baseTransactionDisplayService.formatBudgetTransaction).toHaveBeenCalledWith(
                mockTransaction1,
                '123'
            );
            expect(baseTransactionDisplayService.formatBudgetTransaction).toHaveBeenCalledWith(
                mockTransaction2,
                '456'
            );
        });

        it('should skip transactions without journal ID', () => {
            const transactionWithoutId = {
                ...mockTransaction1,
                transaction_journal_id: undefined,
            };

            (baseTransactionDisplayService.formatBudgetTransaction as jest.Mock).mockReturnValue(
                'formatted'
            );

            const result = service.formatBudgetTransactions([transactionWithoutId], 'Test');

            expect(baseTransactionDisplayService.formatBudgetTransaction).not.toHaveBeenCalled();
            expect(result).toContain('Transactions for Test:');
            // Header should be present but no transaction lines
            const lines = result.split('\n');
            expect(lines).toHaveLength(1);
        });

        it('should handle mixed transactions with and without IDs', () => {
            const transactionWithoutId = {
                ...mockTransaction1,
                transaction_journal_id: undefined,
            };

            (
                baseTransactionDisplayService.formatBudgetTransaction as jest.Mock
            ).mockReturnValueOnce('  $75.00  Transaction 2  1/20/2025');

            const result = service.formatBudgetTransactions(
                [transactionWithoutId, mockTransaction2],
                'Test'
            );

            expect(result).toContain('Transactions for Test:');
            expect(result).toContain('  $75.00  Transaction 2  1/20/2025');
            // Only one transaction should be formatted
            expect(baseTransactionDisplayService.formatBudgetTransaction).toHaveBeenCalledTimes(1);
        });

        it('should use budget name in header', () => {
            (baseTransactionDisplayService.formatBudgetTransaction as jest.Mock).mockReturnValue(
                'formatted'
            );

            const result1 = service.formatBudgetTransactions([mockTransaction1], 'Groceries');
            expect(result1).toContain('Transactions for Groceries:');

            const result2 = service.formatBudgetTransactions([mockTransaction1], 'Utilities');
            expect(result2).toContain('Transactions for Utilities:');
        });

        it('should preserve transaction order', () => {
            (baseTransactionDisplayService.formatBudgetTransaction as jest.Mock)
                .mockReturnValueOnce('  $100.00  Transaction 1  1/15/2025')
                .mockReturnValueOnce('  $75.00  Transaction 2  1/20/2025')
                .mockReturnValueOnce('  $50.00  Transaction 3  1/25/2025');

            const transaction3: TransactionSplit = {
                description: 'Transaction 3',
                amount: '50.00',
                currency_symbol: '$',
                date: '2025-01-25T00:00:00Z',
                transaction_journal_id: '789',
            } as TransactionSplit;

            const result = service.formatBudgetTransactions(
                [mockTransaction1, mockTransaction2, transaction3],
                'Test'
            );

            const lines = result.split('\n');
            expect(lines[0]).toContain('Transactions for Test:');
            expect(lines[1]).toContain('Transaction 1');
            expect(lines[2]).toContain('Transaction 2');
            expect(lines[3]).toContain('Transaction 3');
        });
    });
});
