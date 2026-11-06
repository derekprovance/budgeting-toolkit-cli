/**
 * `analyze` assertions, shared by the in-process and e2e layers. Every JSON
 * field is asserted exactly against ANALYZE_EXPECTED; KD-listed fields run as
 * `test.failing`.
 */
import { beforeAll, describe, expect, test } from '@jest/globals';
import type { AnalyzeReportJson } from '../../src/types/dto/report-json.types.js';
import { ANALYZE_EXPECTED, ANALYZE_TEXT } from '../scenario/expected.js';
import { monthParts } from '../scenario/ledger.js';
import type { AssertedMonthId, IdMap } from '../scenario/types.js';
import {
    defineTextTests,
    expectMatchesLedger,
    fieldTest,
    reverseIdMap,
    sorted,
    txKeys,
} from './helpers.js';

export type AnalyzeRun = (
    month: number,
    year: number
) => Promise<{ json: AnalyzeReportJson; text: string }>;

const TOP_LEVEL_KEYS = [
    'additionalIncome',
    'bills',
    'budget',
    'currencyCode',
    'currencySymbol',
    'disposable',
    'month',
    'netCashFlow',
    'paycheck',
    'schemaVersion',
    'unbudgetedExpenses',
    'year',
];

/** `idMap` may be a getter, for layers that only know it after their own beforeAll has seeded */
export function defineAnalyzeSuite(run: AnalyzeRun, idMap: IdMap | (() => IdMap)): void {
    const ids = typeof idMap === 'function' ? idMap : () => idMap;

    for (const month of Object.keys(ANALYZE_EXPECTED) as AssertedMonthId[]) {
        const e = ANALYZE_EXPECTED[month];

        describe(`analyze ${month}`, () => {
            let json: AnalyzeReportJson;
            let text: string;

            beforeAll(async () => {
                const { month: m, year } = monthParts(month);
                ({ json, text } = await run(m, year));
            });

            const rev = () => reverseIdMap(ids());
            const f = (path: string, body: () => void) => fieldTest('analyze', month, path, body);

            test('top-level keys', () => {
                expect(Object.keys(json).sort()).toEqual(TOP_LEVEL_KEYS);
            });
            f('schemaVersion', () => expect(json.schemaVersion).toBe(e.schemaVersion));
            f('month', () => expect(json.month).toBe(e.month));
            f('year', () => expect(json.year).toBe(e.year));
            f('currencyCode', () => expect(json.currencyCode).toBe(e.currencyCode));
            f('currencySymbol', () => expect(json.currencySymbol).toBe(e.currencySymbol));

            f('paycheck.expected', () => expect(json.paycheck.expected).toBe(e.paycheck.expected));
            f('paycheck.actual', () => expect(json.paycheck.actual).toBe(e.paycheck.actual));
            f('paycheck.variance', () => expect(json.paycheck.variance).toBe(e.paycheck.variance));

            for (const bucket of ['additionalIncome', 'unbudgetedExpenses'] as const) {
                f(`${bucket}.total`, () => expect(json[bucket].total).toBe(e[bucket].total));
                f(`${bucket}.transactions`, () =>
                    expect(txKeys(json[bucket].transactions, rev())).toEqual(
                        sorted(e[bucket].transactions)
                    )
                );
                test(`${bucket}.transactions match the ledger`, () =>
                    expectMatchesLedger(json[bucket].transactions, rev(), ids()));
            }

            f('budget.allocated', () => expect(json.budget.allocated).toBe(e.budget.allocated));
            f('budget.spent', () => expect(json.budget.spent).toBe(e.budget.spent));
            f('budget.remaining', () => expect(json.budget.remaining).toBe(e.budget.remaining));

            f('bills.predicted', () => expect(json.bills.predicted).toBe(e.bills.predicted));
            f('bills.actual', () => expect(json.bills.actual).toBe(e.bills.actual));
            f('bills.variance', () => expect(json.bills.variance).toBe(e.bills.variance));
            f('bills.rows', () => {
                const r = rev();
                const rows = Object.fromEntries(
                    json.bills.bills.map(b => [
                        r.bill.get(String(b.id)) ?? `?${b.id}`,
                        {
                            name: b.name,
                            predicted: b.predicted,
                            actual: b.actual,
                            frequency: b.frequency,
                        },
                    ])
                );
                expect(json.bills.bills).toHaveLength(Object.keys(e.bills.rows).length);
                expect(rows).toEqual(e.bills.rows);
            });

            f('disposable.balance', () =>
                expect(json.disposable.balance).toBe(e.disposable.balance)
            );
            f('disposable.transactions', () =>
                expect(txKeys(json.disposable.transactions, rev())).toEqual(
                    sorted(e.disposable.transactions)
                )
            );
            test('disposable.transactions match the ledger', () =>
                expectMatchesLedger(json.disposable.transactions, rev(), ids()));
            f('disposable.action', () =>
                expect(json.disposable.action).toEqual(e.disposable.action)
            );

            f('netCashFlow', () => expect(json.netCashFlow).toBe(e.netCashFlow));

            // Always active, so the net stays checked even while a component
            // field is a known defect. Disposable is deliberately absent.
            test('[R-PURPOSE-1] [R-DISP-1] netCashFlow is income minus envelope spending', () =>
                expect(json.netCashFlow).toBeCloseTo(
                    json.paycheck.actual +
                        json.additionalIncome.total -
                        json.bills.actual -
                        json.budget.spent -
                        json.unbudgetedExpenses.total,
                    2
                ));

            describe('text', () => {
                defineTextTests('analyze', month, ANALYZE_TEXT[month], () => text);
            });
        });
    }
}
