/**
 * Shared plumbing for the scenario suites: id mapping, KD-aware test
 * definition, ledger cross-checks and text smoke checks.
 */
import { expect, test } from '@jest/globals';
import type { TransactionJson } from '../../src/types/dto/report-json.types.js';
import { findKnownDefect, textPath } from '../scenario/expected.js';
import type { KnownDefect, TextExpectation } from '../scenario/expected.js';
import { tx } from '../scenario/ledger.js';
import type { AssertedMonthId, BillKey, BudgetKey, IdMap, TxKey } from '../scenario/types.js';
import { splitSections, stripAnsi, normalizedLines } from '../parse/text-output.js';

export type Command = KnownDefect['command'];

function invert<K extends string>(record: Record<K, string>): Map<string, K> {
    const out = new Map<string, K>();
    for (const [key, id] of Object.entries(record) as [K, string][]) {
        out.set(String(id), key);
    }
    return out;
}

export interface Reverse {
    journal: Map<string, TxKey>;
    bill: Map<string, BillKey>;
    budget: Map<string, BudgetKey>;
}

export function reverseIdMap(idMap: IdMap): Reverse {
    const journal = new Map<string, TxKey>();
    for (const [key, ids] of Object.entries(idMap.transactions) as [
        TxKey,
        { journalId: string },
    ][]) {
        journal.set(String(ids.journalId), key);
    }
    return { journal, bill: invert(idMap.bills), budget: invert(idMap.budgets) };
}

/** Maps journal ids to scenario keys, sorted; unknown ids surface as `?<id>` */
export function txKeys(transactions: { journalId: string }[], reverse: Reverse): string[] {
    return transactions
        .map(t => reverse.journal.get(String(t.journalId)) ?? `?${t.journalId}`)
        .sort();
}

export const sorted = <T>(values: readonly T[]): T[] => [...values].sort();

/**
 * Defines one field test. If KNOWN_DEFECTS lists (command, month, fieldPath),
 * the test is `test.failing`: it asserts the MODEL value and is expected to
 * fail until the defect is fixed, at which point Jest reports it and the entry
 * must be removed.
 */
export function fieldTest(
    command: Command,
    month: AssertedMonthId,
    fieldPath: string,
    body: () => void
): void {
    const defect = findKnownDefect(command, month, fieldPath);
    if (defect) {
        test.failing(`${fieldPath} [${defect.id}]`, body);
    } else {
        test(fieldPath, body);
    }
}

/** Asserts each transaction's fields against the ledger definition */
export function expectMatchesLedger(
    transactions: TransactionJson[],
    reverse: Reverse,
    idMap: IdMap
): void {
    for (const t of transactions) {
        const key = reverse.journal.get(String(t.journalId));
        expect(key).toBeDefined();
        const def = tx(key!);
        expect({
            key,
            type: t.type,
            amount: t.amount,
            date: t.date.slice(0, 10),
            description: t.description,
            budgetId: t.budgetId,
            billId: t.billId,
        }).toEqual({
            key,
            type: def.type,
            amount: def.amount,
            date: def.date,
            description: def.description,
            budgetId: def.budget ? idMap.budgets[def.budget] : null,
            billId: def.bill ? idMap.bills[def.bill] : null,
        });
    }
}

/** Defines the text smoke tests for one command/month */
export function defineTextTests(
    command: Command,
    month: AssertedMonthId,
    expectation: TextExpectation,
    getText: () => string
): void {
    for (const { section, line } of expectation.lines) {
        fieldTest(command, month, textPath(section, line), () => {
            const sections = splitSections(getText());
            expect(sections.has(section)).toBe(true);
            expect(sections.get(section)).toContain(line);
        });
    }

    for (const title of expectation.absentSections) {
        test(`text: no "${title}" section`, () => {
            expect([...splitSections(getText()).keys()]).not.toContain(title);
        });
    }

    for (const fragment of expectation.absentText) {
        test(`text: never mentions "${fragment}"`, () => {
            expect(stripAnsi(getText())).not.toContain(fragment);
        });
    }

    test('text: contains no raw escape sequences after stripping', () => {
        // eslint-disable-next-line no-control-regex
        expect(normalizedLines(getText()).join('\n')).not.toMatch(/\u001B/);
    });
}
