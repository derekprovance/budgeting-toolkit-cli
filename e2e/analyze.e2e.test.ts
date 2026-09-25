/**
 * `analyze` for every asserted month, as JSON (every field exact) and as text
 * (smoke lines), through the real CLI against the seeded Firefly.
 */
import type { AnalyzeReportJson } from '../src/types/dto/report-json.types.js';
import { defineAnalyzeSuite } from '../test-harness/suites/analyze.suite.js';
import { readIdMap } from './helpers/e2e-env.js';
import { parseJsonStdout, runCliOk } from './helpers/run-cli.js';

defineAnalyzeSuite(async (month, year) => {
    const args = ['analyze', '-m', String(month), '-y', String(year)];
    const [json, text] = await Promise.all([runCliOk([...args, '--json']), runCliOk(args)]);
    return { json: parseJsonStdout<AnalyzeReportJson>(json), text: text.stdout };
}, readIdMap());
