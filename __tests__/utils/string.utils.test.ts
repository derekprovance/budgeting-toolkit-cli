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
            // Test cases from the actual bug that was fixed
            expect(StringUtils.normalizeForMatching('Groceries')).toBe('groceries');
            expect(StringUtils.normalizeForMatching('groceries')).toBe('groceries');
            expect(StringUtils.normalizeForMatching('GROCERIES')).toBe('groceries');
            expect(StringUtils.normalizeForMatching(' groceries ')).toBe('groceries');
            expect(StringUtils.normalizeForMatching(' GROCERIES ')).toBe('groceries');
        });
    });

    describe('normalize', () => {
        it('should convert to lowercase', () => {
            expect(StringUtils.normalize('HELLO')).toBe('hello');
            expect(StringUtils.normalize('MiXeD CaSe')).toBe('mixed case');
        });

        it('should trim whitespace', () => {
            expect(StringUtils.normalize('  hello  ')).toBe('hello');
            expect(StringUtils.normalize('\thello\n')).toBe('hello');
        });

        it('should normalize hyphens and underscores to spaces', () => {
            expect(StringUtils.normalize('hello-world')).toBe('hello world');
            expect(StringUtils.normalize('hello_world')).toBe('hello world');
            expect(StringUtils.normalize('hello-world_test')).toBe('hello world test');
        });

        it('should normalize multiple spaces to single space', () => {
            expect(StringUtils.normalize('hello    world')).toBe('hello world');
            expect(StringUtils.normalize('hello\t\tworld')).toBe('hello world');
        });

        it('should remove special characters', () => {
            expect(StringUtils.normalize('hello@world!')).toBe('helloworld');
            expect(StringUtils.normalize('test#123$456')).toBe('test123456');
            expect(StringUtils.normalize('email@example.com')).toBe('emailexamplecom');
        });

        it('should handle combination of transformations', () => {
            expect(StringUtils.normalize('  MY-String_Test@123  ')).toBe('my string test123');
            expect(StringUtils.normalize('PAYROLL_2024-01')).toBe('payroll 2024 01');
        });

        it('should handle empty string', () => {
            expect(StringUtils.normalize('')).toBe('');
        });
    });

    describe('containsNormalized', () => {
        it('should match case-insensitively', () => {
            expect(StringUtils.containsNormalized('HELLO WORLD', 'hello')).toBe(true);
            expect(StringUtils.containsNormalized('hello world', 'WORLD')).toBe(true);
        });

        it('should match with special characters', () => {
            expect(StringUtils.containsNormalized('My-String_Test', 'string')).toBe(true);
            expect(StringUtils.containsNormalized('test@example.com', 'example')).toBe(true);
        });

        it('should match with normalized spaces', () => {
            expect(StringUtils.containsNormalized('HELLO_WORLD', 'hello world')).toBe(true);
            expect(StringUtils.containsNormalized('hello-world', 'hello world')).toBe(true);
        });

        it('should not match when needle not in haystack', () => {
            expect(StringUtils.containsNormalized('hello', 'world')).toBe(false);
            expect(StringUtils.containsNormalized('test', 'testing')).toBe(false);
        });
    });

    describe('matchesAnyPattern', () => {
        it('should match against any pattern', () => {
            expect(StringUtils.matchesAnyPattern('PAYROLL_2024', ['payroll', 'salary'])).toBe(true);
            expect(StringUtils.matchesAnyPattern('My Salary Payment', ['payroll', 'salary'])).toBe(
                true
            );
        });

        it('should return false if no patterns match', () => {
            expect(StringUtils.matchesAnyPattern('bonus payment', ['payroll', 'salary'])).toBe(
                false
            );
        });

        it('should handle normalized comparisons', () => {
            expect(StringUtils.matchesAnyPattern('MY-PAYROLL_CHECK', ['payroll'])).toBe(true);
            expect(StringUtils.matchesAnyPattern('SALARY-PAYMENT@123', ['salary'])).toBe(true);
        });

        it('should handle empty pattern list', () => {
            expect(StringUtils.matchesAnyPattern('anything', [])).toBe(false);
        });

        it('should handle special characters in patterns', () => {
            expect(StringUtils.matchesAnyPattern('test@example.com', ['example.com'])).toBe(true);
        });
    });
});
