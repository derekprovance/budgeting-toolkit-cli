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
}
