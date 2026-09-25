/**
 * Reduces a transaction description to the key `categorize` matches history
 * on. Bank descriptions carry per-purchase reference codes and store numbers
 * (`AMAZON MKTP US*2K3AB1`), so any token containing a digit is dropped and
 * common separators become spaces: `AMAZON MKTP US*2K3AB1` and
 * `Amazon Mktp US*9ZZ1Q` both become `amazon mktp us`.
 *
 * Returns an empty string when nothing identifying is left; callers must treat
 * that as "no key" so unrelated all-numeric descriptions never match.
 */
export function normalizeDescription(description: string | null | undefined): string {
    if (!description) {
        return '';
    }

    return description
        .toLowerCase()
        .replace(/[*#\-_/\\|]+/g, ' ')
        .split(/\s+/)
        .filter(token => token && !/\d/.test(token))
        .join(' ')
        .trim();
}
