import { BillRead } from '@derekprovance/firefly-iii-sdk';
import { dueDatesInMonth } from '../../src/utils/bill-schedule.utils.js';

const bill = (date: string, repeat_freq: string, skip = 0, end_date?: string) =>
    ({
        id: '1',
        type: 'bills',
        attributes: { date, repeat_freq, skip, end_date },
    }) as unknown as BillRead;

/**
 * Every expectation here was observed on Firefly 6.6.6 (V21 in
 * test-harness/VERIFICATION.md).
 */
describe('dueDatesInMonth', () => {
    it('[R-BILL-1] should list every weekly occurrence in the month', () => {
        expect(dueDatesInMonth(bill('2024-12-02', 'weekly'), 1, 2025)).toEqual([
            '2025-01-06',
            '2025-01-13',
            '2025-01-20',
            '2025-01-27',
        ]);
    });

    it('should repeat every (skip + 1) periods', () => {
        expect(dueDatesInMonth(bill('2025-01-01', 'weekly', 1), 1, 2025)).toEqual([
            '2025-01-01',
            '2025-01-15',
            '2025-01-29',
        ]);
        expect(dueDatesInMonth(bill('2025-01-15', 'quarterly', 1), 4, 2025)).toEqual([]);
        expect(dueDatesInMonth(bill('2025-01-15', 'quarterly', 1), 7, 2025)).toEqual([
            '2025-07-15',
        ]);
    });

    it('should clamp a month-end day without drifting', () => {
        const day31 = bill('2025-01-31', 'monthly');
        expect(dueDatesInMonth(day31, 2, 2025)).toEqual(['2025-02-28']);
        expect(dueDatesInMonth(day31, 3, 2025)).toEqual(['2025-03-31']);
        expect(dueDatesInMonth(bill('2025-02-28', 'half-year'), 8, 2025)).toEqual(['2025-08-28']);
    });

    it('should list nothing before the bill starts or after it ends', () => {
        expect(dueDatesInMonth(bill('2025-03-10', 'monthly'), 2, 2025)).toEqual([]);
        expect(dueDatesInMonth(bill('2025-01-10', 'monthly', 0, '2025-02-01'), 3, 2025)).toEqual(
            []
        );
    });

    it('should list nothing for a bill with no usable schedule', () => {
        expect(dueDatesInMonth(bill('', 'monthly'), 1, 2025)).toEqual([]);
        expect(dueDatesInMonth(bill('2025-01-10', 'fortnightly'), 1, 2025)).toEqual([]);
    });
});
