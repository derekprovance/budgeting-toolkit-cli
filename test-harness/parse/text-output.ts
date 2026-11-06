/**
 * Helpers for smoke-checking the CLI's human-readable output.
 *
 * Lines are normalised by stripping ANSI (including OSC-8 hyperlinks), trimming
 * and collapsing whitespace runs, so a comparison is exact on content but
 * indifferent to column padding.
 */
import stripAnsiLib from 'strip-ansi';

/** Title given to everything before the first ┌─┐ section header */
export const PREAMBLE = '(preamble)';

// OSC 8 hyperlinks: ESC ] 8 ; params ; url (ST | BEL) — removed explicitly in
// case strip-ansi leaves them.
// eslint-disable-next-line no-control-regex
const OSC8 = /\u001B\]8;[^\u0007\u001B]*(?:\u0007|\u001B\\)/g;

export function stripAnsi(text: string): string {
    return stripAnsiLib(text.replace(OSC8, ''));
}

export function normalizeLine(line: string): string {
    return line.trim().replace(/\s+/g, ' ');
}

/** Non-empty normalised lines */
export function normalizedLines(text: string): string[] {
    return stripAnsi(text)
        .split(/\r?\n/)
        .map(normalizeLine)
        .filter(line => line.length > 0);
}

const SECTION_TITLE = /^│\s*(.+?)\s*│$/;

/**
 * Splits output into sections keyed by the title of each
 * `┌───┐ / │ TITLE │ / └───┘` header. The border lines are dropped. A title
 * that appears twice keeps the lines of both occurrences.
 */
export function splitSections(text: string): Map<string, string[]> {
    const sections = new Map<string, string[]>([[PREAMBLE, []]]);
    const lines = normalizedLines(text);
    let current = PREAMBLE;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const next = lines[i + 1];
        const after = lines[i + 2];
        const title = next?.match(SECTION_TITLE);
        if (line.startsWith('┌') && title && after?.startsWith('└')) {
            current = title[1];
            if (!sections.has(current)) {
                sections.set(current, []);
            }
            i += 2;
            continue;
        }
        sections.get(current)!.push(line);
    }

    return sections;
}
