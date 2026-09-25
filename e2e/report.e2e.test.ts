/**
 * `report` for every asserted month: budget rows, bills and Unbudgeted
 * Expenses, as JSON and text.
 */
import type { BudgetReportJson } from '../src/types/dto/report-json.types.js';
import { defineReportSuite } from '../test-harness/suites/report.suite.js';
import { readIdMap } from './helpers/e2e-env.js';
import { parseJsonStdout, runCliOk } from './helpers/run-cli.js';

defineReportSuite(async (month, year) => {
    const args = ['report', '-m', String(month), '-y', String(year)];
    const [json, text] = await Promise.all([runCliOk([...args, '--json']), runCliOk(args)]);
    return { json: parseJsonStdout<BudgetReportJson>(json), text: text.stdout };
}, readIdMap());
