/**
 * The e2e run's artifacts (written by scripts/e2e/up.sh and seed.ts) and the
 * localhost guard every network-touching helper goes through.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { assertLocalFirefly } from '../../test-harness/safety.js';
import type { IdMap } from '../../test-harness/scenario/types.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const STATE_DIR = path.join(ROOT, '.e2e');
export const ENV_PATH = path.join(STATE_DIR, 'env');
export const STATE_PATH = path.join(STATE_DIR, 'state.json');
export const ID_MAP_PATH = path.join(STATE_DIR, 'id-map.json');
export const CONFIG_PATH = path.join(STATE_DIR, 'config.yaml');
export const E2E_EMAIL = 'e2e@btk.invalid';

export interface E2eState {
    port: number;
    url: string;
}

export interface Credentials {
    url: string;
    token: string;
}

export function readState(): E2eState {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as E2eState;
}

/** Parses an env file explicitly (never dotenv's search path) */
export function readEnvFile(file: string): Record<string, string> {
    return dotenv.parse(fs.readFileSync(file));
}

/**
 * Throws unless `envFile` points at the local e2e Firefly on the port that
 * up.sh recorded. Called before every request and every CLI spawn.
 */
export function assertEnvFileIsLocal(envFile: string = ENV_PATH): Credentials {
    const env = readEnvFile(envFile);
    const url = env.FIREFLY_API_URL ?? '';
    assertLocalFirefly(url, readState().port);
    return { url, token: env.FIREFLY_API_TOKEN ?? '' };
}

export function readIdMap(): IdMap {
    return JSON.parse(fs.readFileSync(ID_MAP_PATH, 'utf8')) as IdMap;
}

/** Raw API call against the e2e Firefly (path relative to /api), guard first */
export async function api(
    apiPath: string,
    init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; body: unknown }> {
    const { url, token } = assertEnvFileIsLocal();
    const res = await fetch(`${url}/api${apiPath}`, {
        method: init.method ?? 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.api+json',
            ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        // leave as text
    }
    return { status: res.status, body };
}

/** GET that must succeed; returns the parsed body */
export async function getJson(apiPath: string): Promise<unknown> {
    const { status, body } = await api(apiPath);
    if (status !== 200) {
        throw new Error(`GET ${apiPath} → ${status}: ${JSON.stringify(body).slice(0, 500)}`);
    }
    return body;
}
