import { describe, expect, test } from '@jest/globals';
import {
    PREAMBLE,
    normalizeLine,
    normalizedLines,
    splitSections,
    stripAnsi,
} from '../../test-harness/parse/text-output.js';
import { PREAMBLE as EXPECTED_PREAMBLE } from '../../test-harness/scenario/expected.js';

describe('stripAnsi', () => {
    test('removes SGR colour codes', () => {
        expect(stripAnsi('\u001B[32m+$10.00\u001B[39m ✓')).toBe('+$10.00 ✓');
    });

    // V18: OSC-8 hyperlinks, as DisplayFormatterUtils.createHyperlink emits them
    test('removes OSC-8 hyperlinks with ST or BEL terminators', () => {
        const st = '\u001B]8;;http://127.0.0.1/transactions/show/5\u001B\\Grocer\u001B]8;;\u001B\\';
        const bel = '\u001B]8;;http://x\u0007Grocer\u001B]8;;\u0007';
        expect(stripAnsi(st)).toBe('Grocer');
        expect(stripAnsi(bel)).toBe('Grocer');
    });
});

describe('line normalisation', () => {
    test('trims and collapses whitespace', () => {
        expect(normalizeLine('    Net Cash Flow:                 +$1626.00 ✓  ')).toBe(
            'Net Cash Flow: +$1626.00 ✓'
        );
    });

    test('drops blank lines', () => {
        expect(normalizedLines('a\n\n   \n b ')).toEqual(['a', 'b']);
    });
});

describe('splitSections', () => {
    const sample = [
        '',
        '╔════╗',
        '║  Report  ║',
        '╚════╝',
        '┌─────────┐',
        '│ INCOME SOURCES        │',
        '└─────────┘',
        '',
        '  Additional Income            $420.00 ✓',
        '┌─────────┐',
        '│ \u001B[1mFINANCIAL SUMMARY\u001B[22m   │',
        '└─────────┘',
        '    Net Cash Flow:   +$1626.00 ✓',
        '┌─────────┐',
        '│ INCOME SOURCES │',
        '└─────────┘',
        'again',
    ].join('\n');

    test('keys lines by section title, preamble first', () => {
        const sections = splitSections(sample);
        expect([...sections.keys()]).toEqual([PREAMBLE, 'INCOME SOURCES', 'FINANCIAL SUMMARY']);
        expect(sections.get(PREAMBLE)).toEqual(['╔════╗', '║ Report ║', '╚════╝']);
        expect(sections.get('INCOME SOURCES')).toEqual(['Additional Income $420.00 ✓', 'again']);
        expect(sections.get('FINANCIAL SUMMARY')).toEqual(['Net Cash Flow: +$1626.00 ✓']);
    });

    test('a │ line without borders is ordinary content', () => {
        expect(splitSections('│ not a header │').get(PREAMBLE)).toEqual(['│ not a header │']);
    });

    test('expected.ts uses the same preamble title', () => {
        expect(EXPECTED_PREAMBLE).toBe(PREAMBLE);
    });
});
