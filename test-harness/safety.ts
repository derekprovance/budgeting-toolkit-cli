/**
 * Guards that keep the harness away from real data and real credentials.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/**
 * Throws unless `url` is an http(s) URL on 127.0.0.1 or localhost (and, when
 * given, on `expectedPort`). Call before any seeding or CLI run.
 */
export function assertLocalFirefly(url: string, expectedPort?: number | string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`Refusing to run: Firefly URL is not a valid URL: ${JSON.stringify(url)}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`Refusing to run: Firefly URL must be http(s), got ${parsed.protocol}`);
    }

    if (!LOCAL_HOSTS.has(parsed.hostname)) {
        throw new Error(
            `Refusing to run: Firefly URL host '${parsed.hostname}' is not 127.0.0.1 or localhost`
        );
    }

    if (expectedPort !== undefined && parsed.port !== String(expectedPort)) {
        throw new Error(
            `Refusing to run: Firefly URL port '${parsed.port || '(default)'}' ` +
                `does not match expected ${expectedPort}`
        );
    }
}

/** Prefixes never inherited from the parent environment */
const SECRET_PREFIXES = ['FIREFLY_', 'ANTHROPIC_'];

export interface ChildEnvOptions {
    /** HOME for the child; a fresh temp directory when omitted */
    home?: string;
}

/**
 * Builds a child-process environment FROM SCRATCH. Nothing is inherited from
 * process.env except PATH — in particular no FIREFLY_* or ANTHROPIC_*.
 *
 * `extra` is applied last; an `undefined` value removes a key. ANTHROPIC_* is
 * rejected outright (no harness run may reach Anthropic), and a FIREFLY_API_URL
 * passed in `extra` must be local.
 */
export function buildChildEnv(
    extra: Record<string, string | undefined> = {},
    options: ChildEnvOptions = {}
): Record<string, string> {
    const home = options.home ?? fs.mkdtempSync(path.join(os.tmpdir(), 'btk-child-home-'));

    const env: Record<string, string> = {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HOME: home,
        USERPROFILE: home,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        LOG_LEVEL: 'silent',
        TZ: 'UTC',
        BTK_STRICT_CONFIG: '1',
    };

    for (const [key, value] of Object.entries(extra)) {
        if (key.startsWith('ANTHROPIC_')) {
            throw new Error(`Refusing to pass ${key} to a harness child process`);
        }
        if (key === 'FIREFLY_API_URL' && value !== undefined) {
            assertLocalFirefly(value);
        }
        if (value === undefined) {
            delete env[key];
        } else {
            env[key] = value;
        }
    }

    // Belt and braces: the base never contains these, but prove it
    for (const key of Object.keys(env)) {
        if (SECRET_PREFIXES.some(p => key.startsWith(p)) && !(key in extra)) {
            delete env[key];
        }
    }

    return env;
}
