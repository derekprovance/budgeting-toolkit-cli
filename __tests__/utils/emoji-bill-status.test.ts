import { EmojiUtils } from '../../src/utils/emoji.utils.js';
import { BillDetailDto, isBillUpcoming } from '../../src/types/dto/bill-comparison.dto.js';

describe('bill status', () => {
    const NOW = new Date('2026-08-24T12:00:00Z');

    const bill = (dueDate?: Date) =>
        new BillDetailDto('1', 'Starry Internet', 50, 0, 'monthly', dueDate, dueDate ? 50 : 0);

    describe('isBillUpcoming', () => {
        it('should treat a future due date as upcoming', () => {
            expect(isBillUpcoming(bill(new Date('2026-08-27T00:00:00Z')), NOW)).toBe(true);
        });

        it('should not treat a past due date as upcoming', () => {
            // Past its date and unpaid is not "not yet due" -- it is simply
            // unpaid, and judging it normally is the honest reading.
            expect(isBillUpcoming(bill(new Date('2026-08-10T00:00:00Z')), NOW)).toBe(false);
        });

        it('should not treat a bill with no due date as upcoming', () => {
            expect(isBillUpcoming(bill(), NOW)).toBe(false);
        });
    });

    describe('getBillVarianceEmoji', () => {
        it('should judge a bill on its variance', () => {
            expect(EmojiUtils.getBillVarianceEmoji(0, 50)).toBe('🟢');
        });

        it('should still flag an overspend', () => {
            expect(EmojiUtils.getBillVarianceEmoji(30, 5)).toBe('🔴');
        });
    });
});
