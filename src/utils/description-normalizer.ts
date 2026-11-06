/**
 * The key `categorize` matches history on. Tokens containing a digit are
 * per-purchase reference codes, so `AMAZON MKTP US*2K3AB1` becomes
 * `amazon mktp us`. An empty string means "no key": callers must not match on
 * it, or unrelated all-numeric descriptions would match.
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
