/**
 * Keeps RULES.md and the tests in lockstep. Every rule id must be named by at
 * least one test (`[R-XFER-1] ...`), and every id a test names must still
 * exist, so neither a rule nor its tests can change without the other.
 */
import { describe, expect, test } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TEST_DIRS = ['__tests__', 'e2e', 'test-harness'];
const SELF = relative(ROOT, fileURLToPath(import.meta.url));

function ruleIds(): string[] {
    const rules = readFileSync(join(ROOT, 'RULES.md'), 'utf8');
    return [...rules.matchAll(/^### (R-[A-Z]+-\d+):/gm)].map(m => m[1]);
}

function testFiles(dir: string): string[] {
    return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.ts'))
        .map(entry => relative(ROOT, join(entry.parentPath, entry.name)))
        .filter(file => file !== SELF);
}

/**
 * Every rule a test names, with the files that name it. Only ids that open a
 * string literal count (`'[R-XFER-1] [R-XFER-2] ignores …'`): that is how a
 * test title or a table case names a rule, and it keeps a stray `[R-…]` in a
 * comment from standing in for a deleted test.
 */
function references(): Map<string, string[]> {
    const found = new Map<string, string[]>();
    for (const file of TEST_DIRS.flatMap(testFiles)) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        for (const [, prefix] of source.matchAll(/['"`]((?:\[R-[A-Z]+-\d+\]\s*)+)/g)) {
            for (const [, id] of prefix.matchAll(/\[(R-[A-Z]+-\d+)\]/g)) {
                found.getOrInsert(id, []).push(file);
            }
        }
    }
    return found;
}

describe('RULES.md coverage', () => {
    const ids = ruleIds();
    const refs = references();

    test('RULES.md defines rules', () => {
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('every rule is named by at least one test', () => {
        expect(ids.filter(id => !refs.has(id))).toEqual([]);
    });

    test('every rule a test names exists in RULES.md', () => {
        const unknown = [...refs.keys()].filter(id => !ids.includes(id));
        expect(unknown.map(id => `${id} in ${refs.get(id)!.join(', ')}`)).toEqual([]);
    });
});
