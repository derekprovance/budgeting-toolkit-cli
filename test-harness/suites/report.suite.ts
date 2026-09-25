/**
 * `report` assertions, shared by the in-process and e2e layers. Every JSON
 * field is asserted exactly against REPORT_EXPECTED; KD-listed fields run as
 * `test.failing`.
 */
import { beforeAll, describe, expect, test } from '@jest/globals';
import type { BudgetReportJson } from '../../src/types/dto/report-json.types.js';
import { REPORT_EXPECTED, REPORT_TEXT } from '../scenario/expected.js';
import type { ExpectedBudgetRow } from '../scenario/expected.js';
import { monthParts } from '../scenario/ledger.js';
import type { AssertedMonthId, BudgetKey, IdMap } from '../scenario/types.js';
import {
    defineTextTests,
    expectMatchesLedger,
    fieldTest,
    reverseIdMap,
    sorted,
    txKeys,
} from './helpers.js';

export type ReportRun = (
    month: number,
    year: number
) => Promise<{ json: BudgetReportJson; text: string }>;

const TOP_LEVEL_KEYS = [
    'bills',
    'budgets',
    'currencySymbol',
    'month',
    'schemaVersion',
    'totals',
    'unbudgetedExpenses',
    'year',
];

const ROW_FIELDS: (keyof ExpectedBudgetRow)[] = [
    'name',
    'allocated',
    'spent',
    'remaining',
    'percentageUsed',
    'status',
    'previousMonthSpent',
    'averageSpent',
];

export function defineReportSuite(run: ReportRun, idMap: IdMap | (() => IdMap)): void {
    const ids = typeof idMap === 'function' ? idMap : () => idMap;

    for (const month of Object.keys(REPORT_EXPECTED) as AssertedMonthId[]) {
        const e = REPORT_EXPECTED[month];

        describe(`report ${month}`, () => {
            let json: BudgetReportJson;
            let text: string;

            beforeAll(async () => {
                const { month: m, year } = monthParts(month);
                ({ json, text } = await run(m, year));
            });

            const rev = () => reverseIdMap(ids());
            const f = (path: string, body: () => void) => fieldTest('report', month, path, body);
            const row = (key: BudgetKey) => {
                const id = ids().budgets[key];
                const found = json.budgets.filter(b => String(b.id) === String(id));
                expect(found).toHaveLength(1);
                return found[0];
            };

            test('top-level keys', () => {
                expect(Object.keys(json).sort()).toEqual(TOP_LEVEL_KEYS);
            });
            f('schemaVersion', () => expect(json.schemaVersion).toBe(e.schemaVersion));
            f('month', () => expect(json.month).toBe(e.month));
            f('year', () => expect(json.year).toBe(e.year));
            f('currencySymbol', () => expect(json.currencySymbol).toBe(e.currencySymbol));

            f('totals.spent', () => expect(json.totals.spent).toBe(e.totals.spent));
            f('totals.allocated', () => expect(json.totals.allocated).toBe(e.totals.allocated));
            f('totals.percentageUsed', () =>
                expect(json.totals.percentageUsed).toBe(e.totals.percentageUsed)
            );

            test('budgets: exactly the four scenario budgets', () => {
                const r = rev();
                expect(
                    json.budgets.map(b => r.budget.get(String(b.id)) ?? `?${b.id}`).sort()
                ).toEqual(sorted(Object.keys(e.budgets)));
            });

            for (const key of Object.keys(e.budgets) as BudgetKey[]) {
                for (const field of ROW_FIELDS) {
                    f(`budgets.${key}.${field}`, () =>
                        expect(row(key)[field]).toBe(e.budgets[key][field])
                    );
                }
            }

            f('bills.predicted', () => expect(json.bills.predicted).toBe(e.bills.predicted));
            f('bills.actual', () => expect(json.bills.actual).toBe(e.bills.actual));
            f('bills.variance', () => expect(json.bills.variance).toBe(e.bills.variance));

            f('unbudgetedExpenses.total', () =>
                expect(json.unbudgetedExpenses.total).toBe(e.unbudgetedExpenses.total)
            );
            f('unbudgetedExpenses.transactions', () =>
                expect(txKeys(json.unbudgetedExpenses.transactions, rev())).toEqual(
                    sorted(e.unbudgetedExpenses.transactions)
                )
            );
            test('unbudgetedExpenses.transactions match the ledger', () =>
                expectMatchesLedger(json.unbudgetedExpenses.transactions, rev(), ids()));

            describe('text', () => {
                defineTextTests('report', month, REPORT_TEXT[month], () => text);
            });
        });
    }
}
