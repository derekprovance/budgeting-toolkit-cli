import { BudgetReportService } from '../../src/services/budget-report.service.js';
import { BudgetService } from '../../src/services/core/budget.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { BudgetReportDto } from '../../src/types/dto/budget-report.dto.js';
import { BudgetRead, BudgetLimitRead, InsightGroup } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';

jest.mock('../../src/services/core/budget.service');
jest.mock('../../src/services/core/transaction-classification.service');

describe('BudgetReportService', () => {
    let budgetReportService: BudgetReportService;
    let mockBudgetService: jest.Mocked<BudgetService>;
    let mockTransactionClassificationService: jest.Mocked<TransactionClassificationService>;

    beforeEach(() => {
        mockBudgetService = {
            getBudgets: jest.fn(),
            getBudgetLimits: jest.fn(),
            getBudgetExpenseInsights: jest.fn(),
            getTransactionsWithoutBudget: jest.fn(),
        } as unknown as jest.Mocked<BudgetService>;

        mockTransactionClassificationService = {
            isBill: jest.fn<(transaction: TransactionSplit) => boolean>(),
            isDisposableIncome: jest.fn<(transaction: TransactionSplit) => boolean>(),
        } as unknown as jest.Mocked<TransactionClassificationService>;

        budgetReportService = new BudgetReportService(
            mockBudgetService,
            mockTransactionClassificationService
        );
    });

    describe('getBudgetReport', () => {
        it('should return budget report for all budgets', async () => {
            const mockBudgets: BudgetRead[] = [
                {
                    id: '1',
                    attributes: { name: 'Budget 1' },
                },
                {
                    id: '2',
                    attributes: { name: 'Budget 2' },
                },
            ] as BudgetRead[];

            const mockLimits: BudgetLimitRead[] = [
                {
                    id: '1',
                    attributes: { budget_id: '1', amount: '100.00' },
                },
                {
                    id: '2',
                    attributes: { budget_id: '2', amount: '200.00' },
                },
            ] as BudgetLimitRead[];

            const mockInsights = [
                {
                    id: '1',
                    difference_float: 50.0,
                },
                {
                    id: '2',
                    difference_float: 150.0,
                },
            ] as unknown as InsightGroup;

            mockBudgetService.getBudgets.mockResolvedValueOnce(mockBudgets);
            mockBudgetService.getBudgetLimits.mockResolvedValueOnce(mockLimits);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValueOnce(mockInsights);

            const result = await budgetReportService.getBudgetReport(1, 2024);

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                name: 'Budget 1',
                amount: 100.0,
                spent: 50.0,
            } as BudgetReportDto);
            expect(result[1]).toEqual({
                name: 'Budget 2',
                amount: 200.0,
                spent: 150.0,
            } as BudgetReportDto);
        });

        it('should handle budgets with no limits or insights', async () => {
            const mockBudgets: BudgetRead[] = [
                {
                    id: '1',
                    attributes: { name: 'Budget 1' },
                },
            ] as BudgetRead[];

            mockBudgetService.getBudgets.mockResolvedValueOnce(mockBudgets);
            mockBudgetService.getBudgetLimits.mockResolvedValueOnce([]);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValueOnce(
                [] as unknown as InsightGroup
            );

            const result = await budgetReportService.getBudgetReport(1, 2024);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                name: 'Budget 1',
                amount: 0.0,
                spent: 0.0,
            } as BudgetReportDto);
        });

        it('should throw error when API call fails', async () => {
            mockBudgetService.getBudgets.mockRejectedValueOnce(new Error('API Error'));

            await expect(budgetReportService.getBudgetReport(1, 2024)).rejects.toThrow(
                'Failed to get budget report for month 1'
            );
        });

        it('should validate month and year', async () => {
            await expect(budgetReportService.getBudgetReport(0, 2024)).rejects.toThrow();
            await expect(budgetReportService.getBudgetReport(13, 2024)).rejects.toThrow();
        });
    });
});
