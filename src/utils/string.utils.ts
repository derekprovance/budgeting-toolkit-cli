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
     * Checks if a string matches any of the provided patterns using normalized
     * comparison, matching on whole words.
     *
     * A bare substring test makes short patterns dangerously broad: "transfer"
     * would swallow "Transferwise" and "transferred", quietly dropping real
     * transactions from a report. Normalization already reduces separators to
     * spaces, so word boundaries are the right granularity.
     *
     * @example
     * StringUtils.matchesAnyPattern("MY_PAYROLL", ["payroll", "salary"]) // true
     * StringUtils.matchesAnyPattern("TRANSFERWISE INC", ["transfer"]) // false
     */
    /**
     * Lowercases and splits on any run of non-alphanumeric characters.
     *
     * Unlike {@link normalize}, punctuation separates words rather than being
     * deleted, so "example.com" is two words and cannot accidentally fuse with
     * its neighbours.
     */
    private static splitIntoWords(value: string): string[] {
        return value
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(Boolean);
    }

    static matchesAnyPattern(input: string, patterns: readonly string[]): boolean {
        const inputWords = this.splitIntoWords(input);

        return patterns.some(pattern => {
            const patternWords = this.splitIntoWords(pattern);
            if (patternWords.length === 0) {
                return false;
            }

            // A multi-word pattern must appear as a contiguous run of words
            return inputWords.some((_, start) =>
                patternWords.every((word, offset) => inputWords[start + offset] === word)
            );
        });
    }
}
