/**
 * The fake Firefly against the recorded Firefly contract. The same suite runs
 * against real Firefly 6.6.6 in e2e; both must pass the same literals.
 */
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { defineFireflyContractSuite } from '../../test-harness/suites/firefly-contract.suite.js';
import type { IdMap } from '../../test-harness/scenario/types.js';
import { startScenario, SCENARIO_TOKEN, type Scenario } from './harness.js';

let scenario: Scenario;

beforeAll(async () => {
    scenario = await startScenario();
}, 60_000);

afterAll(async () => {
    await scenario?.stop();
});

async function request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${scenario.fake.apiBase}${path}`, {
        ...init,
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${SCENARIO_TOKEN}`,
            ...(init.headers ?? {}),
        },
    });
}

async function getJson(path: string): Promise<unknown> {
    const res = await request(path);
    if (!res.ok) {
        throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
    }
    return res.json();
}

defineFireflyContractSuite(getJson, (): IdMap => scenario.idMap);

describe('fake Firefly: failure modes', () => {
    test('an unknown route is a 501 naming the method and path', async () => {
        const res = await request('/v1/piggy-banks');
        expect(res.status).toBe(501);
        const body = (await res.json()) as { method: string; path: string };
        expect(body).toMatchObject({ method: 'GET', path: '/api/v1/piggy-banks' });
    });

    test('a missing or wrong token is a 401', async () => {
        const res = await fetch(`${scenario.fake.apiBase}/v1/about`, {
            headers: { Authorization: 'Bearer wrong' },
        });
        expect(res.status).toBe(401);
    });

    test('a transfer without a destination is a 422 (V7)', async () => {
        const res = await request('/v1/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transactions: [
                    {
                        type: 'transfer',
                        date: '2030-01-01',
                        amount: '1',
                        description: 'nowhere',
                        source_id: scenario.idMap.accounts.CHK,
                    },
                ],
            }),
        });
        expect(res.status).toBe(422);
    });

    test('setting the primary currency without a body is a 415 (V13)', async () => {
        const res = await request('/v1/currencies/USD/primary', { method: 'POST' });
        expect(res.status).toBe(415);
    });
});
