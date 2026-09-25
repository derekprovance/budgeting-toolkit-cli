import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import { assertLocalFirefly, buildChildEnv } from '../../test-harness/safety.js';

describe('assertLocalFirefly', () => {
    test.each([
        'http://127.0.0.1:8080',
        'http://127.0.0.1:55001/api',
        'http://localhost:8080/',
        'https://localhost',
    ])('accepts %s', url => {
        expect(() => assertLocalFirefly(url)).not.toThrow();
    });

    test.each([
        'https://fin.derek.pro',
        'https://fin.derek.pro/api',
        'http://127.0.0.1.evil.example:8080',
        'http://localhost.evil.example',
        'http://10.0.0.5:8080',
        'http://[::1]:8080',
        'http://0.0.0.0:8080',
        'file:///etc/passwd',
        'not a url',
        '',
    ])('rejects %s', url => {
        expect(() => assertLocalFirefly(url)).toThrow(/Refusing to run/);
    });

    test('checks the port when one is expected', () => {
        expect(() => assertLocalFirefly('http://127.0.0.1:55001', 55001)).not.toThrow();
        expect(() => assertLocalFirefly('http://127.0.0.1:55001', '55001')).not.toThrow();
        expect(() => assertLocalFirefly('http://127.0.0.1:8080', 55001)).toThrow(/port/);
        expect(() => assertLocalFirefly('http://127.0.0.1', 55001)).toThrow(/port/);
    });
});

describe('buildChildEnv', () => {
    const saved = { ...process.env };
    const withParentEnv = (vars: Record<string, string>, fn: () => void) => {
        Object.assign(process.env, vars);
        try {
            fn();
        } finally {
            for (const key of Object.keys(vars)) {
                if (key in saved) process.env[key] = saved[key];
                else delete process.env[key];
            }
        }
    };

    test('builds the fixed base from scratch', () => {
        const env = buildChildEnv();
        expect(env).toEqual({
            PATH: process.env.PATH,
            HOME: expect.any(String),
            USERPROFILE: env.HOME,
            NO_COLOR: '1',
            FORCE_COLOR: '0',
            LOG_LEVEL: 'silent',
            TZ: 'UTC',
            BTK_STRICT_CONFIG: '1',
        });
        expect(fs.statSync(env.HOME).isDirectory()).toBe(true);
        expect(env.HOME).not.toBe(saved.HOME);
    });

    test('never inherits FIREFLY_* / ANTHROPIC_* or anything else from the parent', () => {
        withParentEnv(
            {
                FIREFLY_API_URL: 'https://fin.derek.pro',
                FIREFLY_API_TOKEN: 'real-token',
                ANTHROPIC_API_KEY: 'sk-real',
                ENV_FILE: '/home/me/.budget/.env',
                SOME_OTHER: 'x',
            },
            () => {
                const env = buildChildEnv();
                for (const key of Object.keys(env)) {
                    expect(key).not.toMatch(/^(FIREFLY_|ANTHROPIC_)/);
                }
                expect(env.ENV_FILE).toBeUndefined();
                expect(env.SOME_OTHER).toBeUndefined();
            }
        );
    });

    test('applies extra last, and undefined removes a key', () => {
        const env = buildChildEnv(
            { ENV_FILE: '/tmp/e2e/env', BTK_PAGE_SIZE: '10', NO_COLOR: undefined },
            { home: '/tmp/fixed-home' }
        );
        expect(env.ENV_FILE).toBe('/tmp/e2e/env');
        expect(env.BTK_PAGE_SIZE).toBe('10');
        expect(env.HOME).toBe('/tmp/fixed-home');
        expect('NO_COLOR' in env).toBe(false);
    });

    test('an explicit FIREFLY_API_URL must be local', () => {
        expect(buildChildEnv({ FIREFLY_API_URL: 'http://127.0.0.1:9' }).FIREFLY_API_URL).toBe(
            'http://127.0.0.1:9'
        );
        expect(() => buildChildEnv({ FIREFLY_API_URL: 'https://fin.derek.pro' })).toThrow(
            /Refusing to run/
        );
    });

    test('refuses ANTHROPIC_* outright', () => {
        expect(() => buildChildEnv({ ANTHROPIC_API_KEY: 'sk-x' })).toThrow(/ANTHROPIC_API_KEY/);
    });
});
