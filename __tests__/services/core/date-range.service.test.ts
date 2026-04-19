import { describe, it, expect } from '@jest/globals';
import { DateRangeService } from '../../../src/services/core/date-range.service.js';

describe('DateRangeService', () => {
    let service: DateRangeService;

    beforeEach(() => {
        service = new DateRangeService();
    });

    describe('getDateRange', () => {
        it('should return correct date range for January', () => {
            const result = service.getDateRange(1, 2024);

            expect(result.startDate.getMonth()).toBe(0); // January = 0
            expect(result.startDate.getDate()).toBe(1);
            expect(result.startDate.getFullYear()).toBe(2024);

            expect(result.endDate.getMonth()).toBe(0); // Still January
            expect(result.endDate.getDate()).toBe(31);
            expect(result.endDate.getFullYear()).toBe(2024);
        });

        it('should return correct date range for February in leap year', () => {
            const result = service.getDateRange(2, 2024); // 2024 is a leap year

            expect(result.startDate.getMonth()).toBe(1); // February = 1
            expect(result.startDate.getDate()).toBe(1);

            expect(result.endDate.getMonth()).toBe(1);
            expect(result.endDate.getDate()).toBe(29); // Leap year
        });

        it('should return correct date range for February in non-leap year', () => {
            const result = service.getDateRange(2, 2023); // 2023 is not a leap year

            expect(result.endDate.getMonth()).toBe(1);
            expect(result.endDate.getDate()).toBe(28);
        });

        it('should return correct date range for December', () => {
            const result = service.getDateRange(12, 2024);

            expect(result.startDate.getMonth()).toBe(11); // December = 11
            expect(result.startDate.getDate()).toBe(1);

            expect(result.endDate.getMonth()).toBe(11);
            expect(result.endDate.getDate()).toBe(31);
        });

        it('should handle all months correctly', () => {
            const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

            monthDays.forEach((expectedDays, monthIndex) => {
                const month = monthIndex + 1;
                const result = service.getDateRange(month, 2023); // Non-leap year

                expect(result.startDate.getDate()).toBe(1);
                expect(result.endDate.getDate()).toBe(expectedDays);
            });
        });

        it('should return date objects', () => {
            const result = service.getDateRange(5, 2024);

            expect(result.startDate instanceof Date).toBe(true);
            expect(result.endDate instanceof Date).toBe(true);
        });
    });
});
