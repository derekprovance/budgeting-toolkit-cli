import { daysLeftInMonth } from '../../src/utils/days-left.utils.js';

describe('daysLeftInMonth', () => {
    it('should count today as a day still remaining', () => {
        // 31 January, a 31-day month: today is still spendable
        expect(daysLeftInMonth(1, 2024, new Date(2024, 0, 31))).toBe(1);
    });

    it('should count the whole month on the first', () => {
        expect(daysLeftInMonth(1, 2024, new Date(2024, 0, 1))).toBe(31);
    });

    it('should include today mid-month', () => {
        // 24th of a 31-day month leaves the 24th through the 31st
        expect(daysLeftInMonth(1, 2024, new Date(2024, 0, 24))).toBe(8);
    });

    it('should handle a short month', () => {
        expect(daysLeftInMonth(2, 2024, new Date(2024, 1, 29))).toBe(1);
    });
});
