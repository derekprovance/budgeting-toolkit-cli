import {
    daysLeftInMonth,
    localDay,
    monthRange,
    shiftMonth,
    toDay,
} from '../../src/utils/date.utils.js';

describe('monthRange', () => {
    it('[R-TIME-1] should bound a month by its first and last day', () => {
        expect(monthRange(1, 2024)).toEqual({ start: '2024-01-01', end: '2024-01-31' });
        expect(monthRange(12, 2024)).toEqual({ start: '2024-12-01', end: '2024-12-31' });
    });

    it('should end February on the 29th only in a leap year', () => {
        expect(monthRange(2, 2024).end).toBe('2024-02-29');
        expect(monthRange(2, 2023).end).toBe('2023-02-28');
    });

    it('should give every month its own length', () => {
        const ends = Array.from({ length: 12 }, (_, i) =>
            Number(monthRange(i + 1, 2023).end.slice(8))
        );
        expect(ends).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    });
});

describe('monthRange validation', () => {
    it.each([0, 13, 1.5])('should reject month %p', month => {
        expect(() => monthRange(month, 2024)).toThrow('Month must be an integer between 1 and 12');
    });

    it.each([1899, 10000, 2024.5])('should reject year %p', year => {
        expect(() => monthRange(1, year)).toThrow('Year must be a valid 4-digit year');
    });
});

describe('toDay', () => {
    it('should read the calendar day a Firefly datetime names, ignoring its offset', () => {
        // Parsed as an instant this is January 31 in UTC
        expect(toDay('2027-02-01T00:00:00+01:00')).toBe('2027-02-01');
        expect(toDay('garbage')).toBeNull();
    });
});

describe('localDay', () => {
    it('should format the local calendar day', () => {
        expect(localDay(new Date(2025, 0, 5, 23, 30))).toBe('2025-01-05');
    });
});

describe('shiftMonth', () => {
    it('should move across year boundaries in either direction', () => {
        expect(shiftMonth(1, 2024, -1)).toEqual({ month: 12, year: 2023 });
        expect(shiftMonth(11, 2024, 3)).toEqual({ month: 2, year: 2025 });
        expect(shiftMonth(3, 2024, -14)).toEqual({ month: 1, year: 2023 });
    });
});

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
