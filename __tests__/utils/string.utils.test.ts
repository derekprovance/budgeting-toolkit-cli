import { describe, it, expect } from '@jest/globals';
import { StringUtils } from '../../src/utils/string.utils.js';

describe('StringUtils', () => {
    describe('normalizeForMatching', () => {
        it('should convert to lowercase', () => {
            expect(StringUtils.normalizeForMatching('HELLO')).toBe('hello');
            expect(StringUtils.normalizeForMatching('Groceries')).toBe('groceries');
            expect(StringUtils.normalizeForMatching('MiXeD CaSe')).toBe('mixed case');
        });

        it('should trim leading and trailing whitespace', () => {
            expect(StringUtils.normalizeForMatching('  hello  ')).toBe('hello');
            expect(StringUtils.normalizeForMatching(' Groceries ')).toBe('groceries');
            expect(StringUtils.normalizeForMatching('\thello\n')).toBe('hello');
        });

        it('should preserve special characters', () => {
            expect(StringUtils.normalizeForMatching('Bills & Utilities')).toBe('bills & utilities');
            expect(StringUtils.normalizeForMatching("Children's Expenses")).toBe(
                "children's expenses"
            );
            expect(StringUtils.normalizeForMatching('Food-Groceries')).toBe('food-groceries');
        });

        it('should preserve internal spaces', () => {
            expect(StringUtils.normalizeForMatching('Hello  World')).toBe('hello  world');
            expect(StringUtils.normalizeForMatching('Multiple   Spaces')).toBe('multiple   spaces');
        });

        it('should handle unicode characters', () => {
            expect(StringUtils.normalizeForMatching('CAFÉ')).toBe('café');
            expect(StringUtils.normalizeForMatching('Naïve')).toBe('naïve');
        });

        it('should handle combination of transformations', () => {
            expect(StringUtils.normalizeForMatching('  GROCERIES  ')).toBe('groceries');
            expect(StringUtils.normalizeForMatching(' Bills & Utilities ')).toBe(
                'bills & utilities'
            );
            expect(StringUtils.normalizeForMatching('  Food-Groceries  ')).toBe('food-groceries');
        });

        it('should handle empty string', () => {
            expect(StringUtils.normalizeForMatching('')).toBe('');
        });

        it('should handle whitespace-only string', () => {
            expect(StringUtils.normalizeForMatching('   ')).toBe('');
            expect(StringUtils.normalizeForMatching('\t\n')).toBe('');
        });

        it('should match real-world category names', () => {
            expect(StringUtils.normalizeForMatching('Groceries')).toBe('groceries');
            expect(StringUtils.normalizeForMatching('groceries')).toBe('groceries');
            expect(StringUtils.normalizeForMatching('GROCERIES')).toBe('groceries');
            expect(StringUtils.normalizeForMatching(' groceries ')).toBe('groceries');
            expect(StringUtils.normalizeForMatching(' GROCERIES ')).toBe('groceries');
        });
    });
});
