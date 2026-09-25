/**
 * Firefly III's own behavior, asserted with the same literals the in-process
 * fake is built from (test-harness/scenario/firefly-contract.ts). Raw fetch,
 * so nothing in src/ sits between the assertion and the server.
 */
import { defineFireflyContractSuite } from '../test-harness/suites/firefly-contract.suite.js';
import { getJson, readIdMap } from './helpers/e2e-env.js';

defineFireflyContractSuite(getJson, readIdMap());
