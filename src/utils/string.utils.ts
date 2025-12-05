/**
 * Utility functions for string manipulation and normalization.
 */
export class StringUtils {
    /**
     * Normalizes a string for case-insensitive matching by:
     * 1. Trimming leading/trailing whitespace
     * 2. Converting to lowercase
     *
     * This is used for matching category and budget names where we want to
     * preserve special characters (e.g., "Bills & Utilities" should match
     * "bills & utilities" but remain "Bills & Utilities").
     *
     * @param value - The string to normalize
     * @returns The normalized string (trimmed and lowercase)
     *
     * @example
     * StringUtils.normalizeForMatching("  Groceries  ")  // "groceries"
     * StringUtils.normalizeForMatching("Bills & Utilities") // "bills & utilities"
     * StringUtils.normalizeForMatching("CAFÉ") // "café"
     */
    static normalizeForMatching(value: string): string {
        return value.trim().toLowerCase();
    }

    /**
     * Normalizes a string for comparison by:
     * 1. Converting to lowercase
     * 2. Trimming whitespace
     * 3. Normalizing spaces, hyphens, and underscores to single spaces
     * 4. Removing special characters
     *
     * @example
     * StringUtils.normalize("My-String_Test")  // "my string test"
     * StringUtils.normalize("  HELLO  WORLD  ") // "hello world"
     */
    static normalize(input: string): string {
        return input
            .toLowerCase()
            .trim()
            .replace(/[-_\s]+/g, ' ') // Replace multiple spaces, hyphens, underscores with single space
            .replace(/[^\w\s]/g, ''); // Remove all other special characters
    }

    /**
     * Checks if a string contains another string using normalized comparison.
     * Case-insensitive and handles special characters.
     *
     * @example
     * StringUtils.containsNormalized("My-String", "string") // true
     * StringUtils.containsNormalized("HELLO_WORLD", "hello world") // true
     */
    static containsNormalized(haystack: string, needle: string): boolean {
        return this.normalize(haystack).includes(this.normalize(needle));
    }

    /**
     * Checks if a string matches any of the provided patterns using normalized comparison.
     *
     * @example
     * StringUtils.matchesAnyPattern("MY_PAYROLL", ["payroll", "salary"]) // true
     */
    static matchesAnyPattern(input: string, patterns: readonly string[]): boolean {
        const normalizedInput = this.normalize(input);
        return patterns.some(pattern => normalizedInput.includes(this.normalize(pattern)));
    }
}
