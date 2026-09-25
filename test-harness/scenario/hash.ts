/**
 * Deterministic fingerprint of what a seeded database contains.
 *
 * sha256 over a canonical JSON (recursively sorted keys) of the ledger plus
 * the config built from a symbolic id map (each key standing in for its own
 * id). Any edit to either changes the hash, so reuse mode refuses a database
 * seeded from a different scenario.
 */
import { createHash } from 'node:crypto';
import { LEDGER, MARKER_TAG_PREFIX } from './ledger.js';
import { buildScenarioConfig } from './config.js';
import type { AccountKey } from './types.js';

/** Bump to force a reseed when seeding *semantics* change but data does not */
export const SCENARIO_SCHEMA = 1;

export function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        // undefined never reaches here from object values (skipped below)
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(v => canonicalJson(v === undefined ? null : v)).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

const SYMBOLIC_ACCOUNTS: Record<AccountKey, string> = {
    CHK: 'CHK',
    CC: 'CC',
    SAV: 'SAV',
    BRK: 'BRK',
    POOL: 'POOL',
    OLD: 'OLD',
};

export function scenarioHash(): string {
    const payload = canonicalJson({
        schema: SCENARIO_SCHEMA,
        ledger: LEDGER,
        config: buildScenarioConfig({ accounts: SYMBOLIC_ACCOUNTS }),
    });
    return createHash('sha256').update(payload).digest('hex');
}

/** Short form used in the marker tag (first 16 hex chars) */
export function markerTag(): string {
    return `${MARKER_TAG_PREFIX}${scenarioHash().slice(0, 16)}`;
}
