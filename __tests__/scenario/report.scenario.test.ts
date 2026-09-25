/**
 * `report` end to end, in process: real commands, real SDK and pagination,
 * against the fake Firefly seeded with the scenario ledger.
 */
import { afterAll, beforeAll } from '@jest/globals';
import { defineReportSuite } from '../../test-harness/suites/report.suite.js';
import { startScenario, type Scenario } from './harness.js';

let scenario: Scenario;

beforeAll(async () => {
    scenario = await startScenario();
}, 60_000);

afterAll(async () => {
    await scenario?.stop();
});

defineReportSuite(
    (month, year) => scenario.runReport(month, year),
    () => scenario.idMap
);
