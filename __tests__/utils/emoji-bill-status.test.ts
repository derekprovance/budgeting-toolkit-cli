import { EmojiUtils } from '../../src/utils/emoji.utils.js';

describe('EmojiUtils.getBillVarianceEmoji', () => {
    const NOW = new Date('2026-08-24T12:00:00Z');

    it('should mark a bill that has not come around yet as upcoming', () => {
        // Rendering it green puts it beside genuinely cheap bills and invites
        // the reader to bank money they still owe.
        const emoji = EmojiUtils.getBillVarianceEmoji(
            -50, // unpaid, so variance is the whole amount
            50,
            new Date('2026-08-27T00:00:00Z'),
            NOW
        );

        expect(emoji).toBe('⏳');
    });

    it('should judge a bill normally once its due date has passed', () => {
        const emoji = EmojiUtils.getBillVarianceEmoji(
            -50,
            50,
            new Date('2026-08-10T00:00:00Z'),
            NOW
        );

        expect(emoji).not.toBe('⏳');
    });

    it('should judge a bill normally when no due date is carried', () => {
        expect(EmojiUtils.getBillVarianceEmoji(0, 50, undefined, NOW)).toBe('🟢');
    });

    it('should still flag an overspend that also has a future due date', () => {
        // Paid early and over: the amount is real, so judge it.
        expect(EmojiUtils.getBillVarianceEmoji(30, 5, undefined, NOW)).toBe('🔴');
    });
});
