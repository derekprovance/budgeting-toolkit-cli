/**
 * `analyze` end to end, in process: real commands, real SDK and pagination,
 * against the fake Firefly seeded with the scenario ledger.
 */
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { defineAnalyzeSuite } from '../../test-harness/suites/analyze.suite.js';
import {
    MONTH_RANGES,
    TRANSACTION_PAGINATION,
} from '../../test-harness/scenario/firefly-contract.js';
import { startScenario, type Scenario } from './harness.js';

let scenario: Scenario;

beforeAll(async () => {
    scenario = await startScenario();
}, 60_000);

afterAll(async () => {
    await scenario?.stop();
});

defineAnalyzeSuite(
    (month, year) => scenario.runAnalyze(month, year),
    () => scenario.idMap
);

describe('analyze pagination', () => {
    test('January transactions are drained across every page', async () => {
        scenario.fake.clearRequestLog();
        await scenario.runAnalyze(1, 2025);
        const { start, end } = MONTH_RANGES['2025-01'];
        const served = scenario.fake.served('/v1/transactions', { start, end });
        const pages = new Set(served.map(r => r.query.get('page')));
        expect(served.every(r => r.query.get('limit') === String(scenario.pageSize))).toBe(true);
        expect(pages.size).toBeGreaterThan(1);
        expect([...pages].sort()).toEqual(
            Array.from({ length: TRANSACTION_PAGINATION['2025-01'].totalPages }, (_, i) =>
                String(i + 1)
            )
        );
    });
});
