import { DateUtils } from '../../src/utils/date.utils.js';
import { BudgetDateParams } from '../../../src/types/common.types.js';
import { DateRangeDto } from '../../src/types/dto/date-range.dto.js';

describe('DateUtils', () => {
    describe('validateMonthYear', () => {
        it('should validate valid month and year', () => {
            expect(() => DateUtils.validateMonthYear(1, 2024)).not.toThrow();
            expect(() => DateUtils.validateMonthYear(12, 2024)).not.toThrow();
        });

        it('should throw for month less than 1', () => {
            expect(() => DateUtils.validateMonthYear(0, 2024)).toThrow(
                'Month must be an integer between 1 and 12'
            );
        });

        it('should throw for month greater than 12', () => {
            expect(() => DateUtils.validateMonthYear(13, 2024)).toThrow(
                'Month must be an integer between 1 and 12'
            );
        });

        it('should throw for non-integer month', () => {
            expect(() => DateUtils.validateMonthYear(1.5, 2024)).toThrow(
                'Month must be an integer between 1 and 12'
            );
        });

        it('should throw for year less than 1900', () => {
            expect(() => DateUtils.validateMonthYear(1, 1899)).toThrow(
                'Year must be a valid 4-digit year'
            );
        });

        it('should throw for year greater than 9999', () => {
            expect(() => DateUtils.validateMonthYear(1, 10000)).toThrow(
                'Year must be a valid 4-digit year'
            );
        });

        it('should throw for non-integer year', () => {
            expect(() => DateUtils.validateMonthYear(1, 2024.5)).toThrow(
                'Year must be a valid 4-digit year'
            );
        });
    });

    describe('validateBudgetDateParams', () => {
        it('should validate valid budget date params', () => {
            const params: BudgetDateParams = {
                month: 1,
                year: 2024,
            };
            expect(() => DateUtils.validateBudgetDateParams(params)).not.toThrow();
        });

        it('should throw for invalid month', () => {
            const params: BudgetDateParams = {
                month: 13,
                year: 2024,
            };
            expect(() => DateUtils.validateBudgetDateParams(params)).toThrow(
                'Month must be an integer between 1 and 12'
            );
        });

        it('should throw for invalid year', () => {
            const params: BudgetDateParams = {
                month: 1,
                year: 1899,
            };
            expect(() => DateUtils.validateBudgetDateParams(params)).toThrow(
                'Year must be a valid 4-digit year'
            );
        });
    });

    describe('validateDateRange', () => {
        it('should validate valid date range', () => {
            const range: DateRangeDto = {
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-12-31'),
            };
            expect(() => DateUtils.validateDateRange(range)).not.toThrow();
        });

        it('should validate date range with same start and end date', () => {
            const range: DateRangeDto = {
                startDate: new Date('2024-01-01'),
                endDate: new Date('2024-01-01'),
            };
            expect(() => DateUtils.validateDateRange(range)).not.toThrow();
        });

        it('should throw for invalid start date', () => {
            const range = {
                startDate: 'not a date',
                endDate: new Date('2024-12-31'),
            } as unknown as DateRangeDto;
            expect(() => DateUtils.validateDateRange(range)).toThrow(
                'Start and end dates must be valid Date objects'
            );
        });

        it('should throw for invalid end date', () => {
            const range = {
                startDate: new Date('2024-01-01'),
                endDate: 'not a date',
            } as unknown as DateRangeDto;
            expect(() => DateUtils.validateDateRange(range)).toThrow(
                'Start and end dates must be valid Date objects'
            );
        });

        it('should throw when start date is after end date', () => {
            const range: DateRangeDto = {
                startDate: new Date('2024-12-31'),
                endDate: new Date('2024-01-01'),
            };
            expect(() => DateUtils.validateDateRange(range)).toThrow(
                'Start date must be before or equal to end date'
            );
        });
    });
});
