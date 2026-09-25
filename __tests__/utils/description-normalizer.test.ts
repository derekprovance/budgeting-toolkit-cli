import { normalizeDescription } from '../../src/utils/description-normalizer.js';

describe('normalizeDescription', () => {
    it('strips per-purchase reference codes so repeat merchants share a key', () => {
        expect(normalizeDescription('AMAZON MKTP US*2K3AB1')).toBe('amazon mktp us');
        expect(normalizeDescription('Amazon Mktp US*9ZZ1Q')).toBe('amazon mktp us');
    });

    it('drops store numbers and separators', () => {
        expect(normalizeDescription('TRADER JOES #552')).toBe('trader joes');
        expect(normalizeDescription('SQ - COFFEE BAR 0042')).toBe('sq coffee bar');
    });

    it('ignores case and whitespace', () => {
        expect(normalizeDescription('  Netflix   COM ')).toBe('netflix com');
    });

    it('returns an empty key when nothing identifying is left', () => {
        expect(normalizeDescription('123456 7890')).toBe('');
        expect(normalizeDescription('')).toBe('');
        expect(normalizeDescription(undefined)).toBe('');
        expect(normalizeDescription(null)).toBe('');
    });
});
