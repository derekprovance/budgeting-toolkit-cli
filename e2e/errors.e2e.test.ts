/**
 * Refusals: bad arguments, invalid or missing config, bad credentials,
 * categorize with no Anthropic key, and strict mode without ENV_FILE. Every
 * case must exit non-zero with a message saying why.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import * as yaml from 'js-yaml';
import { stripAnsi } from '../test-harness/parse/text-output.js';
import { buildChildEnv } from '../test-harness/safety.js';
import { invalidConfigs } from '../test-harness/scenario/config.js';
import { assertEnvFileIsLocal, readIdMap } from './helpers/e2e-env.js';
import { runCli, tempDir } from './helpers/run-cli.js';

const idMap = readIdMap();
const JAN = ['-m', '1', '-y', '2025'];

function writeYaml(dir: string, name: string, value: unknown): string {
    const file = path.join(dir, name);
    fs.writeFileSync(file, yaml.dump(value, { lineWidth: -1 }));
    return file;
}

describe('errors', () => {
    let dir: string;
    beforeAll(() => {
        dir = tempDir('btk-e2e-errors-');
    });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    test('month 13 is rejected', async () => {
        const r = await runCli(['analyze', '-m', '13', '-y', '2025']);
        expect(r.code).toBe(1);
        expect(r.text).toContain('Month must be between 1-12, got: 13');
    });

    describe.each(invalidConfigs(idMap).map(c => [c.name, c] as const))(
        'invalid config: %s',
        (_name, c) => {
            test('exits 1 with the validator message', async () => {
                const file = writeYaml(dir, `${c.name.replace(/\W+/g, '-')}.yaml`, c.config);
                const r = await runCli([c.command, ...JAN], { config: file });
                expect(r.code).toBe(1);
                // Errors belong on stderr: stdout is the command's output, and
                // under --json it must stay parseable.
                expect(stripAnsi(r.stderr)).toMatch(c.expectedError);
                expect(r.stdout.trim()).toBe('');
            });
        }
    );

    test('missing config file', async () => {
        const missing = path.join(dir, 'does-not-exist.yaml');
        const r = await runCli(['analyze', ...JAN], { config: missing });
        expect(r.code).toBe(1);
        expect(r.text).toContain(`Config file not found: ${missing}`);
    });

    test('no --config under strict mode', async () => {
        const r = await runCli(['analyze', ...JAN], { config: null });
        expect(r.code).toBe(1);
        expect(r.text).toContain(
            'BTK_STRICT_CONFIG is set: pass the config file explicitly with --config <path>'
        );
    });

    test('strict mode without ENV_FILE', async () => {
        const r = await runCli(['analyze', ...JAN], { env: { ENV_FILE: undefined } });
        expect(r.code).toBe(1);
        expect(r.text).toContain(
            'BTK_STRICT_CONFIG is set: ENV_FILE must name the .env file to load'
        );
    });

    test('bad token', async () => {
        const { url } = assertEnvFileIsLocal();
        const envFile = path.join(dir, 'bad-token.env');
        fs.writeFileSync(envFile, `FIREFLY_API_URL=${url}\nFIREFLY_API_TOKEN=not-a-real-token\n`, {
            mode: 0o600,
        });
        const r = await runCli(['analyze', ...JAN], { env: { ENV_FILE: envFile } });
        expect(r.code).toBe(1);
        expect(r.text).toMatch(
            /Error analyzing budget: Failed to [\w ]+ for month 1\/2025: Unauthenticated/
        );
        expect(r.stdout).not.toContain('Net Cash Flow');
    });

    describe('categorize without ANTHROPIC_API_KEY', () => {
        // Every outbound request from the child is forced through this
        // recording proxy (NODE_USE_ENV_PROXY), which refuses all of them. The
        // loopback Firefly is exempt via NO_PROXY.
        let proxy: http.Server;
        const hits: string[] = [];
        let proxyEnv: Record<string, string>;

        beforeAll(async () => {
            proxy = http.createServer((req, res) => {
                hits.push(`${req.method} ${req.url}`);
                res.writeHead(403).end();
            });
            proxy.on('connect', (req, socket) => {
                hits.push(`CONNECT ${req.url}`);
                socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            });
            await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
            const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
            proxyEnv = {
                NODE_USE_ENV_PROXY: '1',
                HTTPS_PROXY: proxyUrl,
                HTTP_PROXY: proxyUrl,
                https_proxy: proxyUrl,
                http_proxy: proxyUrl,
                NO_PROXY: '127.0.0.1,localhost',
                no_proxy: '127.0.0.1,localhost',
            };
        });
        afterAll(() => new Promise<void>(resolve => proxy.close(() => resolve())));

        test('control: the proxy does see a request to api.anthropic.com', async () => {
            hits.length = 0;
            const script =
                "fetch('https://api.anthropic.com/v1/messages').catch(() => {}).finally(() => process.exit(0))";
            const code = await new Promise<number | null>((resolve, reject) => {
                const child = spawn(process.execPath, ['-e', script], {
                    env: buildChildEnv(proxyEnv),
                    stdio: 'ignore',
                });
                child.on('error', reject);
                child.on('close', resolve);
            });
            expect(code).toBe(0);
            expect(hits).toContain('CONNECT api.anthropic.com:443');
        });

        test('exits 1 and makes no request to Anthropic', async () => {
            hits.length = 0;
            const r = await runCli(['categorize', 'e2e', '--dry-run'], { env: proxyEnv });
            expect(r.code).toBe(1);
            expect(r.text).toContain('ANTHROPIC_API_KEY is required for categorize command');
            expect(hits).toEqual([]);
        });
    });
});
