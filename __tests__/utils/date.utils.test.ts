import { DateUtils, localDay, monthRange, toDay } from '../../src/utils/date.utils.js';

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
        const ends = Array.from({ length: 12 }, (_, i) => monthRange(i + 1, 2023).end.slice(8));
        expect(ends).toEqual([
            '31',
            '28',
            '31',
            '30',
            '31',
            '30',
            '31',
            '31',
            '30',
            '31',
            '30',
            '31',
        ]);
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
