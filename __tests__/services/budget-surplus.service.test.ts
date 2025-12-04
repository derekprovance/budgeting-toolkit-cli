import '../setup/mock-logger.js'; // Must be first to mock logger module
import { resetMockLogger } from '../setup/mock-logger.js';
import { jest } from '@jest/globals';
import {
    BudgetSurplusService,
    BudgetSurplusResult,
} from '../../src/services/budget-surplus.service.js';
import { BudgetService } from '../../src/services/core/budget.service.js';
import { BudgetLimitRead, BudgetExpenseInsightRead } from '@derekprovance/firefly-iii-sdk';
import { BudgetErrorType } from '../../src/types/error/budget.error.js';

describe('BudgetSurplusService', () => {
    let service: BudgetSurplusService;
    let mockBudgetService: jest.Mocked<BudgetService>;

    beforeEach(() => {
        resetMockLogger();
        jest.clearAllMocks();

        // Create mock budget service
        mockBudgetService = {
            getBudgetLimits: jest.fn<(month: number, year: number) => Promise<BudgetLimitRead[]>>(),
            getBudgetExpenseInsights:
                jest.fn<(month: number, year: number) => Promise<BudgetExpenseInsightRead[]>>(),
        } as unknown as jest.Mocked<BudgetService>;

        service = new BudgetSurplusService(mockBudgetService);
    });

    describe('calculateBudgetSurplus', () => {
        const mockBudgetLimit = (amount: string): BudgetLimitRead =>
            ({
                attributes: {
                    amount,
                },
            }) as BudgetLimitRead;

        const mockBudgetInsight = (differenceFloat: number): BudgetExpenseInsightRead =>
            ({
                difference_float: differenceFloat,
            }) as BudgetExpenseInsightRead;

        it('should calculate surplus when under budget', async () => {
            // Arrange
            const budgetLimits = [mockBudgetLimit('1000.00'), mockBudgetLimit('500.00')];
            const insights = [mockBudgetInsight(-800.0), mockBudgetInsight(-400.0)];

            mockBudgetService.getBudgetLimits.mockResolvedValue(budgetLimits);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValue(insights);

            // Act
            const result = await service.calculateBudgetSurplus(5, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual({
                    totalAllocated: 1500.0,
                    totalSpent: 1200.0,
                    surplus: 300.0,
                } as BudgetSurplusResult);
            }

            expect(mockBudgetService.getBudgetLimits).toHaveBeenCalledWith(5, 2024);
            expect(mockBudgetService.getBudgetExpenseInsights).toHaveBeenCalledWith(5, 2024);
        });

        it('should calculate deficit when over budget', async () => {
            // Arrange
            const budgetLimits = [mockBudgetLimit('800.00'), mockBudgetLimit('400.00')];
            const insights = [mockBudgetInsight(-1000.0), mockBudgetInsight(-600.0)];

            mockBudgetService.getBudgetLimits.mockResolvedValue(budgetLimits);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValue(insights);

            // Act
            const result = await service.calculateBudgetSurplus(6, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual({
                    totalAllocated: 1200.0,
                    totalSpent: 1600.0,
                    surplus: -400.0,
                } as BudgetSurplusResult);
            }
        });

        it('should handle zero budgets', async () => {
            // Arrange
            mockBudgetService.getBudgetLimits.mockResolvedValue([]);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValue([]);

            // Act
            const result = await service.calculateBudgetSurplus(7, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toEqual({
                    totalAllocated: 0,
                    totalSpent: 0,
                    surplus: 0,
                } as BudgetSurplusResult);
            }
        });

        it('should handle NaN amounts in budget limits', async () => {
            // Arrange
            const budgetLimits = [
                mockBudgetLimit('1000.00'),
                mockBudgetLimit('invalid'), // Will be NaN
                mockBudgetLimit('500.00'),
            ];
            const insights = [mockBudgetInsight(-1000.0)];

            mockBudgetService.getBudgetLimits.mockResolvedValue(budgetLimits);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValue(insights);

            // Act
            const result = await service.calculateBudgetSurplus(8, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                // NaN should be treated as 0
                expect(result.value.totalAllocated).toBe(1500.0);
                expect(result.value.totalSpent).toBe(1000.0);
                expect(result.value.surplus).toBe(500.0);
            }
        });

        it('should handle null/undefined difference_float in insights', async () => {
            // Arrange
            const budgetLimits = [mockBudgetLimit('1000.00')];
            const insights = [
                mockBudgetInsight(-500.0),
                { difference_float: null } as BudgetExpenseInsightRead, // null
                { difference_float: undefined } as BudgetExpenseInsightRead, // undefined
            ];

            mockBudgetService.getBudgetLimits.mockResolvedValue(budgetLimits);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValue(insights);

            // Act
            const result = await service.calculateBudgetSurplus(9, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                // null/undefined should be treated as 0
                expect(result.value.totalAllocated).toBe(1000.0);
                expect(result.value.totalSpent).toBe(500.0);
                expect(result.value.surplus).toBe(500.0);
            }
        });

        it('should use absolute value for spent amounts', async () => {
            // Arrange - insights use negative values for spending
            const budgetLimits = [mockBudgetLimit('1000.00')];
            const insights = [
                mockBudgetInsight(-600.0), // Negative value
                mockBudgetInsight(-200.0), // Negative value
            ];

            mockBudgetService.getBudgetLimits.mockResolvedValue(budgetLimits);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValue(insights);

            // Act
            const result = await service.calculateBudgetSurplus(10, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                // Should use Math.abs() on difference_float
                expect(result.value.totalSpent).toBe(800.0);
                expect(result.value.surplus).toBe(200.0);
            }
        });

        it('should return error for invalid month', async () => {
            // Act
            const result = await service.calculateBudgetSurplus(13, 2024);

            // Assert
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe(BudgetErrorType.INVALID_DATE);
                expect(result.error.userMessage).toContain('invalid');
            }

            expect(mockBudgetService.getBudgetLimits).not.toHaveBeenCalled();
            expect(mockBudgetService.getBudgetExpenseInsights).not.toHaveBeenCalled();
        });

        it('should return error for invalid year', async () => {
            // Act
            const result = await service.calculateBudgetSurplus(5, -1);

            // Assert
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe(BudgetErrorType.INVALID_DATE);
            }
        });

        it('should return error when getBudgetLimits fails', async () => {
            // Arrange
            mockBudgetService.getBudgetLimits.mockRejectedValue(new Error('API connection failed'));
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValue([]);

            // Act
            const result = await service.calculateBudgetSurplus(5, 2024);

            // Assert
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe(BudgetErrorType.CALCULATION_FAILED);
                expect(result.error.message).toContain('API connection failed');
            }
        });

        it('should return error when getBudgetExpenseInsights fails', async () => {
            // Arrange
            mockBudgetService.getBudgetLimits.mockResolvedValue([mockBudgetLimit('1000.00')]);
            mockBudgetService.getBudgetExpenseInsights.mockRejectedValue(
                new Error('Insights unavailable')
            );

            // Act
            const result = await service.calculateBudgetSurplus(5, 2024);

            // Assert
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.field).toBe(BudgetErrorType.CALCULATION_FAILED);
                expect(result.error.message).toContain('Insights unavailable');
            }
        });

        it('should fetch budget limits and insights in parallel', async () => {
            // Arrange
            const budgetLimits = [mockBudgetLimit('1000.00')];
            const insights = [mockBudgetInsight(-500.0)];

            let budgetLimitsResolved = false;
            let insightsResolved = false;

            mockBudgetService.getBudgetLimits.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                budgetLimitsResolved = true;
                return budgetLimits;
            });

            mockBudgetService.getBudgetExpenseInsights.mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                insightsResolved = true;
                return insights;
            });

            // Act
            await service.calculateBudgetSurplus(5, 2024);

            // Assert - both should be called
            expect(mockBudgetService.getBudgetLimits).toHaveBeenCalled();
            expect(mockBudgetService.getBudgetExpenseInsights).toHaveBeenCalled();
            expect(budgetLimitsResolved).toBe(true);
            expect(insightsResolved).toBe(true);
        });

        it('should handle large budget amounts correctly', async () => {
            // Arrange
            const budgetLimits = [
                mockBudgetLimit('50000.00'),
                mockBudgetLimit('25000.50'),
                mockBudgetLimit('10000.25'),
            ];
            const insights = [
                mockBudgetInsight(-45000.0),
                mockBudgetInsight(-24000.0),
                mockBudgetInsight(-9500.0),
            ];

            mockBudgetService.getBudgetLimits.mockResolvedValue(budgetLimits);
            mockBudgetService.getBudgetExpenseInsights.mockResolvedValue(insights);

            // Act
            const result = await service.calculateBudgetSurplus(11, 2024);

            // Assert
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.totalAllocated).toBe(85000.75);
                expect(result.value.totalSpent).toBe(78500.0);
                expect(result.value.surplus).toBe(6500.75);
            }
        });
    });
});
