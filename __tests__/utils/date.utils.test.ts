import { DateUtils } from '../../src/utils/date.utils.js';

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
});
