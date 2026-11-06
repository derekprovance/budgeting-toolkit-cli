import { CurrencyUtils } from '../../src/utils/currency.utils.js';
import { DisplayFormatterUtils } from '../../src/utils/display-formatter.utils.js';
import { EmojiUtils } from '../../src/utils/emoji.utils.js';
import stripAnsi from 'strip-ansi';

describe('display rounding', () => {
    it('should never render float noise as a signed zero', () => {
        const noise = 100.1 - 100 - 0.1; // about -5.7e-15
        expect(stripAnsi(DisplayFormatterUtils.formatNetImpact(noise, '$'))).toBe('$0.00 ○');
    });

    it('should keep the minus sign on a negative amount', () => {
        expect(CurrencyUtils.formatSigned(-25, '$')).toBe('-$25.00');
        expect(CurrencyUtils.formatSigned(25, '$')).toBe('$25.00');
        expect(CurrencyUtils.formatSigned(-0.001, '$')).toBe('$0.00');
    });
});

describe('fitWidth', () => {
    it('pads a short text to the column width', () => {
        expect(DisplayFormatterUtils.fitWidth('Rent', 6)).toBe('Rent  ');
    });

    it('truncates a long text to the column width', () => {
        expect(DisplayFormatterUtils.fitWidth('Electricity', 6)).toBe('Electr');
    });
});

describe('isoDay', () => {
    it('keeps only the day of a Firefly timestamp', () => {
        expect(DisplayFormatterUtils.isoDay('2025-04-12T00:00:00+02:00')).toBe('2025-04-12');
    });
});

describe('linkedText', () => {
    it('links the text to the transaction, tolerating a trailing slash', () => {
        expect(DisplayFormatterUtils.linkedText('Coffee', 'http://ff.local/', '7')).toBe(
            '\x1B]8;;http://ff.local/transactions/show/7\x1B\\Coffee\x1B]8;;\x1B\\'
        );
    });

    it('returns the text unchanged without a base URL', () => {
        expect(DisplayFormatterUtils.linkedText('Coffee', '', '7')).toBe('Coffee');
    });

    it('returns the text unchanged without a transaction id', () => {
        expect(DisplayFormatterUtils.linkedText('Coffee', 'http://ff.local', undefined)).toBe(
            'Coffee'
        );
    });
});

describe('category emoji', () => {
    it.each([
        ['Healthcare', '🏥'],
        ['Pet Care', '📊'],
        ['Parent Gifts', '📊'],
        ['Car Insurance', '🚗'],
        ['401(k)', '💰'],
        ['Going Out', '🎮'],
    ])('should match %s on whole words', (name, emoji) => {
        expect(EmojiUtils.getCategoryEmoji(name)).toBe(emoji);
    });
});
